import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { z } from 'zod';
import { APP_ENV, type AppEnv, googleCalendarConfig } from '../../config/env';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../clock/clock.service';
import {
  calendarDisconnectedEmail,
  reservationCanceledByClinicEmail,
} from '../notifications/email/email-templates';
import { EmailService } from '../notifications/email/email.service';
import {
  localDayStart,
  localWeekdayAndMinute,
} from '../vacancies/matching-rules';
import { PricingService } from '../vacancies/pricing.service';
import { VacanciesService } from '../vacancies/vacancies.service';
import {
  CalendarNotConnectedError,
  GoogleCalendarConnectionService,
  isCredentialsRejectedError,
} from './google-calendar-connection.service';
import type { GoogleCalendarApi } from './google-oauth.client';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const WINDOW = 14 * DAY;
// O cadastro ainda não possui duração do exame: mesma fatia de 30 min das fixtures.
const SLOT_MINUTES = 30;
const CANCELED_REASON = 'Evento da reserva apagado ou movido na Google Agenda';
export const CALENDAR_SYNC_JOB = 'calendar-sync';

const eventTimeSchema = z
  .object({
    dateTime: z.iso.datetime({ offset: true }).optional(),
    date: z.iso.date().optional(),
  })
  .refine((value) => Boolean(value.dateTime || value.date));
const eventSchema = z
  .object({
    id: z.string().min(1).max(1024),
    description: z.string().max(65_536).nullish(),
    status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
    transparency: z.enum(['opaque', 'transparent']).optional(),
    start: eventTimeSchema.optional(),
    end: eventTimeSchema.optional(),
  })
  .refine(
    (event) =>
      event.status === 'cancelled' ||
      Boolean(
        event.start && event.end && instant(event.end) > instant(event.start),
      ),
  );
const pageSchema = z.object({
  items: z.array(eventSchema).default([]),
  nextPageToken: z.string().min(1).max(4096).nullish(),
});
type CalendarEvent = z.infer<typeof eventSchema>;

const reservationInclude = {
  slot: { include: { exam: true } },
  patient: { include: { user: { select: { name: true, email: true } } } },
} as const;
type Booking = Prisma.ReservationGetPayload<{
  include: typeof reservationInclude;
}>;
type Clinic = Prisma.ClinicGetPayload<{
  include: {
    openingHours: true;
    exams: true;
    user: { select: { email: true } };
  };
}>;

function instant(time: z.infer<typeof eventTimeSchema>): number {
  // Datas sem hora são eventos de dia inteiro no fuso local da clínica.
  return Date.parse(time.dateTime ?? `${time.date}T00:00:00-03:00`);
}

function identifies(event: CalendarEvent, bookingId: string): boolean {
  return (
    event.description?.split(/\r?\n/).includes(`reservationId=${bookingId}`) ===
    true
  );
}

function unchanged(event: CalendarEvent, booking: Booking): boolean {
  return (
    event.status !== 'cancelled' &&
    Boolean(
      event.start &&
      event.end &&
      instant(event.start) === booking.slot.startsAt.getTime() &&
      instant(event.end) === booking.slot.endsAt.getTime(),
    )
  );
}

function overlaps(event: CalendarEvent, startsAt: Date, endsAt: Date): boolean {
  return (
    event.status !== 'cancelled' &&
    event.transparency !== 'transparent' &&
    Boolean(
      event.start &&
      event.end &&
      instant(event.start) < endsAt.getTime() &&
      instant(event.end) > startsAt.getTime(),
    )
  );
}

/** Snapshot completo antes dos efeitos; eventos manuais só bloqueiam disponibilidade. */
@Injectable()
export class CalendarSyncJob {
  private readonly logger = new Logger(CalendarSyncJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: GoogleCalendarConnectionService,
    private readonly clock: ClockService,
    private readonly vacancies: VacanciesService,
    private readonly pricing: PricingService,
    private readonly email: EmailService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Cron('0 * * * * *', { name: CALENDAR_SYNC_JOB })
  async onCron(): Promise<void> {
    // O mesmo interruptor dos jobs evita disparos reais no banco da suíte.
    if (
      !this.env.VACANCY_MOTOR_ENABLED ||
      !googleCalendarConfig(this.env) ||
      this.running
    )
      return;
    this.running = true;
    try {
      await this.clock.refresh();
      const now = this.clock.now();
      for (const clinicId of await this.connections.listConnectedClinicIds()) {
        try {
          await this.syncClinic(clinicId, now);
        } catch {
          this.logger.error(
            'Sincronização da clínica falhou; próximo ciclo tentará novamente.',
          );
        }
      }
    } catch {
      this.logger.error('Não foi possível iniciar o ciclo da Google Agenda.');
    } finally {
      this.running = false;
    }
  }

  async syncClinic(
    clinicId: string,
    now: Date = this.clock.now(),
  ): Promise<void> {
    const until = new Date(now.getTime() + WINDOW);
    const clinic = await this.prisma.clinic.findUniqueOrThrow({
      where: { id: clinicId },
      include: {
        openingHours: true,
        exams: true,
        user: { select: { email: true } },
        calendarConnection: true,
      },
    });
    const bookings = await this.prisma.reservation.findMany({
      where: {
        state: 'confirmada',
        slot: { clinicId, startsAt: { gte: now, lt: until } },
      },
      include: reservationInclude,
    });
    let events: CalendarEvent[];
    let snapshotCalendarId: string;
    const links = new Map<string, string>();
    // Nenhuma gravação de domínio ocorre antes de todas as chamadas Google confirmarem.
    try {
      const { calendar, calendarId } =
        await this.connections.getAuthorizedCalendar(clinicId);
      snapshotCalendarId = calendarId;
      events = await this.snapshot(calendar, calendarId, now, until);
      for (const booking of bookings) {
        if (booking.googleEventId) continue;
        let event = events.find((item) => identifies(item, booking.id));
        if (!event) {
          event = await this.createEvent(calendar, calendarId, booking);
          events.push(event);
        }
        links.set(booking.id, event.id);
      }
    } catch (error) {
      if (error instanceof CalendarNotConnectedError) return;
      await this.connections.markCredentialsRejected(clinicId);
      this.logger.warn(
        isCredentialsRejectedError(error)
          ? 'Google recusou credenciais; sincronização suspensa.'
          : 'Google indisponível ou resposta inválida; sincronização suspensa.',
      );
      await this.sendEmail(
        clinic.user.email,
        calendarDisconnectedEmail({
          clinicName: clinic.name,
          reconnectUrl: new URL('/clinica/agenda', this.env.WEB_ORIGIN).href,
        }),
        `calendar-disconnected/${clinicId}/${(clinic.calendarConnection?.connectedAt ?? clinic.calendarConnection?.updatedAt)?.getTime()}`,
      );
      return;
    }

    const canceled: Booking[] = [];
    await this.prisma.$transaction(
      async (tx) => {
        // Serializa efeitos do sincronizador entre instâncias, inclusive slots sem índice único.
        await tx.$queryRaw`SELECT "id" FROM "Clinic" WHERE "id" = ${clinicId}::uuid FOR UPDATE`;
        const connection = await tx.calendarConnection.findUnique({
          where: { clinicId },
        });
        if (
          connection?.status !== 'CONNECTED' ||
          connection.calendarId !== snapshotCalendarId ||
          connection.connectedAt?.getTime() !==
            clinic.calendarConnection?.connectedAt?.getTime()
        )
          return;
        for (const booking of bookings) {
          const eventId = booking.googleEventId ?? links.get(booking.id);
          const event = events.find(
            (item) => item.id === eventId && identifies(item, booking.id),
          );
          if (event && unchanged(event, booking)) {
            if (!booking.googleEventId) {
              const linked = await tx.reservation.updateMany({
                where: {
                  id: booking.id,
                  state: 'confirmada',
                  googleEventId: null,
                },
                data: { googleEventId: event.id },
              });
              if (linked.count)
                await tx.slot.update({
                  where: { id: booking.slotId },
                  data: { googleEventId: event.id },
                });
            }
            continue;
          }
          const changed = await this.vacancies.cancelReservation(
            booking.id,
            { origin: 'agenda', reason: CANCELED_REASON },
            tx,
          );
          if (!changed) continue;
          canceled.push(booking);
          if (booking.vacancyId) {
            const vacancy = await tx.vacancy.findUnique({
              where: { id: booking.vacancyId },
            });
            if (vacancy?.state === 'reservada')
              await this.vacancies.transition(
                vacancy.id,
                'cancelada',
                { origin: 'agenda', reason: CANCELED_REASON },
                tx,
                now,
              );
          }
          await this.publishCancellation(booking, now, tx);
        }
        await this.syncFreeSlots(clinic, events, now, until, tx);
      },
      { timeout: 30_000 },
    );

    for (const booking of canceled) {
      await this.sendEmail(
        booking.patient.user.email,
        reservationCanceledByClinicEmail({
          patientName: booking.patient.user.name,
          examName: booking.slot.exam.name,
          clinicName: clinic.name,
          clinicAddress: clinic.address,
          startsAt: booking.slot.startsAt,
          depositCents: booking.depositCents,
          reservationUrl: new URL(
            `/paciente/reservas/${booking.id}`,
            this.env.WEB_ORIGIN,
          ).href,
          reason: CANCELED_REASON,
        }),
        `calendar-cancellation/${booking.id}`,
      );
    }
  }

  private async snapshot(
    calendar: GoogleCalendarApi,
    calendarId: string,
    now: Date,
    until: Date,
  ): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    do {
      const response = await calendar.events.list({
        calendarId,
        timeMin: now.toISOString(),
        timeMax: until.toISOString(),
        singleEvents: true,
        showDeleted: true,
        maxResults: 2500,
        pageToken,
      });
      const page = pageSchema.parse(response.data);
      events.push(...page.items);
      pageToken = page.nextPageToken ?? undefined;
      if (pageToken && seen.has(pageToken))
        throw new Error('Paginação inválida');
      if (pageToken) seen.add(pageToken);
    } while (pageToken);
    return events;
  }

  private async createEvent(
    calendar: GoogleCalendarApi,
    calendarId: string,
    booking: Booking,
  ): Promise<CalendarEvent> {
    // UUID sem hífens é base32hex válido no Google; retentativa não duplica o evento.
    const eventId = booking.id.replaceAll('-', '');
    let event;
    try {
      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          id: eventId,
          summary: `[${booking.slot.exam.tussCode}] ${booking.patient.user.name}`,
          description: `reservationId=${booking.id}`,
          start: { dateTime: booking.slot.startsAt.toISOString() },
          end: { dateTime: booking.slot.endsAt.toISOString() },
        },
      });
      event = eventSchema.parse(response.data);
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
      if (status !== 409) throw error;
      event = eventSchema.parse(
        (await calendar.events.get({ calendarId, eventId })).data,
      );
    }
    if (!identifies(event, booking.id) || !unchanged(event, booking))
      throw new Error('Evento não confirmado pela agenda');
    return event;
  }

  private async publishCancellation(
    booking: Booking,
    now: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const minutes = (booking.slot.startsAt.getTime() - now.getTime()) / MINUTE;
    const exam = booking.slot.exam;
    if (minutes <= Math.max(exam.minLeadMinutes, exam.preparationHours * 60))
      return;
    if (
      await tx.vacancy.findFirst({
        where: {
          slotId: booking.slotId,
          state: { in: ['publicada', 'alertando', 'reservada'] },
        },
      })
    )
      return;
    try {
      const price = await this.pricing.initialPriceCents(booking.slotId, now);
      await this.pricing.publishWithinDailyCap(
        booking.slot.clinicId,
        (db) =>
          this.vacancies.publish(
            {
              slotId: booking.slotId,
              origin: 'cancelamento',
              currentPriceCents: price,
            },
            { origin: 'agenda', reason: CANCELED_REASON },
            db,
          ),
        { tx },
      );
    } catch (error) {
      // O teto é verificado antes de escrever: a reserva continua cancelada.
      if (!(error instanceof UnprocessableEntityException)) throw error;
    }
  }

  private async syncFreeSlots(
    clinic: Clinic,
    events: CalendarEvent[],
    now: Date,
    until: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const existing = await tx.slot.findMany({
      where: { clinicId: clinic.id, startsAt: { gte: now, lt: until } },
    });
    const obsolete = existing.filter(
      (slot) =>
        slot.origin === 'agenda' &&
        !slot.googleEventId &&
        events.some((event) => overlaps(event, slot.startsAt, slot.endsAt)),
    );
    // Histórico nunca é apagado. Somente ofertas vazias que ficaram ocupadas somem.
    if (obsolete.length)
      await tx.slot.deleteMany({
        where: {
          id: { in: obsolete.map((slot) => slot.id) },
          reservations: { none: {} },
          vacancies: { none: {} },
        },
      });
    const keys = new Set(
      existing.map(
        (slot) =>
          `${slot.examId}/${slot.startsAt.toISOString()}/${slot.endsAt.toISOString()}`,
      ),
    );
    const create: Prisma.SlotCreateManyInput[] = [];
    for (
      let day = localDayStart(now);
      day < until;
      day = new Date(day.getTime() + DAY)
    ) {
      const weekday = localWeekdayAndMinute(day).weekday;
      for (const hours of clinic.openingHours.filter(
        (hours) => hours.weekday === weekday,
      )) {
        for (
          let minute = hours.startMinute;
          minute + SLOT_MINUTES <= hours.endMinute;
          minute += SLOT_MINUTES
        ) {
          const startsAt = new Date(day.getTime() + minute * MINUTE);
          const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * MINUTE);
          if (
            startsAt < now ||
            endsAt > until ||
            events.some((event) => overlaps(event, startsAt, endsAt))
          )
            continue;
          for (const exam of clinic.exams) {
            const key = `${exam.id}/${startsAt.toISOString()}/${endsAt.toISOString()}`;
            if (keys.has(key)) continue;
            keys.add(key);
            create.push({
              clinicId: clinic.id,
              examId: exam.id,
              startsAt,
              endsAt,
              origin: 'agenda',
            });
          }
        }
      }
    }
    if (create.length) await tx.slot.createMany({ data: create });
  }

  private async sendEmail(
    to: string,
    content: { subject: string; html: string; text: string },
    key: string,
  ): Promise<void> {
    try {
      await this.email.send({ to, ...content }, { idempotencyKey: key });
    } catch {
      this.logger.warn(
        'Aviso por e-mail não entregue; conferir configuração ou disponibilidade do canal.',
      );
    }
  }
}
