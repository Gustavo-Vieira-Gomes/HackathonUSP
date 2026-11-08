import type {
  ClinicVacancies,
  ClinicVacancyCreateBody,
} from '@hackathon/contracts';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../clock/clock.service';
import { localDayStart } from '../vacancies/matching-rules';
import { currentPriceCents } from '../vacancies/price-engine';
import { PricingService } from '../vacancies/pricing.service';
import { VacanciesService } from '../vacancies/vacancies.service';
import { NoShowMotorService } from './no-show-motor.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

@Injectable()
export class ClinicVacanciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly pricing: PricingService,
    private readonly vacancies: VacanciesService,
    private readonly motor: NoShowMotorService,
  ) {}

  async list(clinicId: string): Promise<ClinicVacancies> {
    await this.clock.refresh();
    const now = this.clock.now();
    const start = localDayStart(now);
    const [vacancies, reservations] = await Promise.all([
      this.prisma.vacancy.findMany({
        where: { slot: { clinicId } },
        select: {
          id: true,
          state: true,
          currentPriceCents: true,
          slot: {
            select: { startsAt: true, exam: { select: { name: true } } },
          },
        },
        orderBy: { slot: { startsAt: 'desc' } },
      }),
      this.prisma.reservation.findMany({
        where: {
          slot: {
            clinicId,
            startsAt: { gte: start, lt: new Date(start.getTime() + DAY) },
          },
        },
        select: {
          id: true,
          state: true,
          slot: {
            select: {
              startsAt: true,
              exam: { select: { name: true, toleranceMinutes: true } },
            },
          },
        },
        orderBy: { slot: { startsAt: 'asc' } },
      }),
    ]);
    return {
      now: now.toISOString(),
      vacancies: vacancies.map(({ slot, ...vacancy }) => ({
        ...vacancy,
        examName: slot.exam.name,
        startsAt: slot.startsAt.toISOString(),
      })),
      reservations: reservations.map(({ slot, ...reservation }) => ({
        ...reservation,
        examName: slot.exam.name,
        startsAt: slot.startsAt.toISOString(),
        canDeclareNoShow:
          reservation.state === 'confirmada' &&
          now.getTime() >=
            slot.startsAt.getTime() + slot.exam.toleranceMinutes * MINUTE,
      })),
    };
  }

  async publish(clinicId: string, body: ClinicVacancyCreateBody) {
    await this.clock.refresh();
    const now = this.clock.now();
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    const exam = await this.prisma.exam.findFirst({
      where: { id: body.examId, clinicId },
      include: { priceSteps: true },
    });
    if (!exam) throw new NotFoundException('Exame não encontrado.');
    const minutesUntilStart = (startsAt.getTime() - now.getTime()) / MINUTE;
    if (minutesUntilStart <= exam.preparationHours * 60)
      throw new UnprocessableEntityException(
        'antecedência menor que o preparo',
      );
    if (minutesUntilStart <= exam.minLeadMinutes)
      throw new UnprocessableEntityException(
        'Horário não atende à antecedência mínima do exame.',
      );
    return this.pricing.publishWithinDailyCap(clinicId, async (tx) => {
      const slot = await tx.slot.create({
        data: { clinicId, examId: exam.id, startsAt, endsAt, origin: 'manual' },
      });
      const vacancy = await this.vacancies.publish(
        {
          slotId: slot.id,
          origin: 'vazio',
          currentPriceCents: currentPriceCents({
            ...exam,
            steps: exam.priceSteps,
            minutesUntilStart,
          }),
        },
        { origin: 'clinica', reason: 'Horário vazio publicado pela clínica' },
        tx,
      );
      return { id: vacancy.id };
    });
  }

  async declareNoShow(clinicId: string, id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Reserva não encontrada.');
    await this.clock.refresh();
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: { id, slot: { clinicId } },
        include: { slot: { include: { exam: true } } },
      });
      if (!reservation) throw new NotFoundException('Reserva não encontrada.');
      const { slot } = reservation;
      const start = localDayStart(now);
      if (
        slot.startsAt < start ||
        slot.startsAt >= new Date(start.getTime() + DAY)
      )
        throw new UnprocessableEntityException(
          'A reserva deve ser do dia atual.',
        );
      if (
        now.getTime() <
        slot.startsAt.getTime() + slot.exam.toleranceMinutes * MINUTE
      )
        throw new UnprocessableEntityException(
          'Aguarde a tolerância de atraso do exame.',
        );
      const updated = await tx.reservation.updateMany({
        where: { id, state: 'confirmada' },
        data: { state: 'no_show' },
      });
      if (updated.count !== 1)
        throw new ConflictException('A reserva não está confirmada.');
      await tx.transition.create({
        data: {
          reservationId: id,
          fromState: 'confirmada',
          toState: 'no_show',
          origin: 'clinica',
          reason: 'Não compareceu; sinal retido',
          occurredAt: now,
        },
      });
      if (reservation.vacancyId)
        await this.vacancies.transition(
          reservation.vacancyId,
          'cancelada',
          {
            origin: 'clinica',
            reason: 'Reserva declarada no-show pela clínica',
          },
          tx,
          now,
        );
      await this.motor.onDeclared(tx, reservation);
      return { id, state: 'no_show' as const };
    });
  }
}
