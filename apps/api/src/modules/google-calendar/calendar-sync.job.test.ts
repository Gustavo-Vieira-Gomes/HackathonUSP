import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import type { PrismaService } from '../../prisma/prisma.service';
import { createSchemaFixtures, examData } from '../../testing/schema-fixtures';
import { startTestApp, type TestApp } from '../../testing/test-app';
import { ClockService } from '../clock/clock.service';
import {
  EmailService,
  type EmailMessage,
} from '../notifications/email/email.service';
import { CalendarSyncJob } from './calendar-sync.job';
import {
  GoogleOAuthClient,
  type GoogleCalendarApi,
} from './google-oauth.client';
import { encryptToken } from './token-cipher';

const NOW = new Date('2026-11-08T10:00:00.000Z');
const HOUR = 3_600_000;
const KEY = Buffer.alloc(32, 9);
type Event = {
  id: string;
  description?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};
type Insert = { requestBody: Event & { summary: string } };
type FakeCalendar = {
  events: Event[];
  inserts: Insert[];
  lists: { timeMin: string; timeMax: string; pageToken?: string }[];
  fail?: Error;
  secondPageFail?: boolean;
  onList?: () => Promise<void>;
};
let t: TestApp;
let prisma: PrismaService;
let fixtures: ReturnType<typeof createSchemaFixtures>;
let job: CalendarSyncJob;
const calendars = new Map<string, FakeCalendar>();
const emails: EmailMessage[] = [];

before(async () => {
  t = await startTestApp({
    VACANCY_MOTOR_ENABLED: 'false',
    GOOGLE_OAUTH_CLIENT_ID: 'test.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret',
    GOOGLE_OAUTH_REDIRECT_URI:
      'http://localhost:3000/api/google-calendar/callback',
    GOOGLE_TOKEN_ENCRYPTION_KEY: KEY.toString('base64'),
  });
  prisma = t.prisma;
  fixtures = createSchemaFixtures(prisma);
  job = t.app.get(CalendarSyncJob);
  mock.method(t.app.get(ClockService), 'now', () => NOW);
  mock.method(
    t.app.get(EmailService),
    'send',
    async (message: EmailMessage) => {
      emails.push(message);
      return { id: 'email-falso' };
    },
  );
  const api = {
    events: {
      list: async (input: {
        calendarId: string;
        timeMin: string;
        timeMax: string;
        pageToken?: string;
      }) => {
        const fake = calendars.get(input.calendarId);
        assert.ok(fake);
        fake.lists.push(input);
        await fake.onList?.();
        if (fake.fail) throw fake.fail;
        if (input.pageToken) throw new Error('Google indisponível na página 2');
        return {
          data: {
            items: fake.events,
            ...(fake.secondPageFail ? { nextPageToken: 'page-2' } : {}),
          },
        };
      },
      insert: async (input: Insert & { calendarId: string }) => {
        const fake = calendars.get(input.calendarId);
        assert.ok(fake);
        fake.inserts.push(input);
        fake.events.push(input.requestBody);
        return { data: input.requestBody };
      },
      get: async (input: { calendarId: string; eventId: string }) => {
        const fake = calendars.get(input.calendarId);
        assert.ok(fake);
        const event = fake.events.find((item) => item.id === input.eventId);
        if (!event)
          throw Object.assign(new Error('not found'), {
            response: { status: 404 },
          });
        return { data: event };
      },
    },
  } as unknown as GoogleCalendarApi;
  mock.method(t.app.get(GoogleOAuthClient), 'calendarFor', () => api);
});

after(async () => {
  mock.restoreAll();
  if (!t) return;
  const clinics = { clinic: { userId: { in: fixtures.userIds } } };
  await prisma.transition.deleteMany({
    where: {
      OR: [{ vacancy: { slot: clinics } }, { reservation: { slot: clinics } }],
    },
  });
  await prisma.alert.deleteMany({ where: { vacancy: { slot: clinics } } });
  await prisma.reservation.deleteMany({ where: { slot: clinics } });
  await prisma.vacancy.deleteMany({ where: { slot: clinics } });
  await prisma.slot.deleteMany({ where: clinics });
  await prisma.priceStep.deleteMany({ where: { exam: clinics } });
  await prisma.exam.deleteMany({ where: clinics });
  await prisma.patient.deleteMany({
    where: { userId: { in: fixtures.userIds } },
  });
  await prisma.clinic.deleteMany({
    where: { userId: { in: fixtures.userIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: fixtures.userIds } } });
  await t.close();
});

async function clinic() {
  const row = await fixtures.createClinic();
  const calendarId = `calendar-${row.id}`;
  await prisma.calendarConnection.create({
    data: {
      clinicId: row.id,
      status: 'CONNECTED',
      calendarId,
      refreshToken: encryptToken(KEY, row.id, 'refresh-falso'),
    },
  });
  const fake: FakeCalendar = { events: [], inserts: [], lists: [] };
  calendars.set(calendarId, fake);
  const exam = await prisma.exam.create({
    data: examData(row.id, { minLeadMinutes: 360, preparationHours: 0 }),
  });
  return { row, exam, fake };
}

async function reservation(hours: number, linked = true, preparationHours = 0) {
  const setup = await clinic();
  if (preparationHours)
    await prisma.exam.update({
      where: { id: setup.exam.id },
      data: { preparationHours },
    });
  const patient = await fixtures.createPatient();
  const slot = await prisma.slot.create({
    data: {
      clinicId: setup.row.id,
      examId: setup.exam.id,
      startsAt: new Date(NOW.getTime() + hours * HOUR),
      endsAt: new Date(NOW.getTime() + hours * HOUR + HOUR / 2),
      origin: 'agenda',
      googleEventId: linked ? 'event-original' : null,
    },
  });
  const booking = await prisma.reservation.create({
    data: {
      slotId: slot.id,
      patientId: patient.id,
      type: 'comum',
      state: 'confirmada',
      chargedPriceCents: setup.exam.fullPriceCents,
      depositCents: 0,
      paymentMethod: 'no_local',
      googleEventId: linked ? 'event-original' : null,
    },
  });
  return { ...setup, slot, booking, patient };
}

test('H19-03/04: evento apagado com 24h cancela, avisa e publica no horário original uma vez', async () => {
  const x = await reservation(24);
  const beforeEmails = emails.length;
  await job.syncClinic(x.row.id, NOW);
  await job.syncClinic(x.row.id, NOW);
  const booking = await prisma.reservation.findUniqueOrThrow({
    where: { id: x.booking.id },
  });
  assert.equal(booking.state, 'cancelada');
  assert.equal(booking.slotId, x.slot.id);
  const vacancies = await prisma.vacancy.findMany({
    where: { slotId: x.slot.id },
    include: { transitions: true },
  });
  assert.equal(vacancies.length, 1);
  assert.equal(vacancies[0]?.state, 'publicada');
  assert.equal(vacancies[0]?.origin, 'cancelamento');
  assert.equal(vacancies[0]?.transitions[0]?.origin, 'agenda');
  assert.equal(
    await prisma.transition.count({
      where: {
        reservationId: booking.id,
        toState: 'cancelada',
        origin: 'agenda',
      },
    }),
    1,
  );
  assert.equal(emails.length - beforeEmails, 1);
  assert.match(emails.at(-1)?.subject ?? '', /cancelou/);
});

test('H19-04: com 2h e mínimo 6h cancela sem publicar', async () => {
  const x = await reservation(2);
  await job.syncClinic(x.row.id, NOW);
  assert.equal(
    (
      await prisma.reservation.findUniqueOrThrow({
        where: { id: x.booking.id },
      })
    ).state,
    'cancelada',
  );
  assert.equal(await prisma.vacancy.count({ where: { slotId: x.slot.id } }), 0);
});

test('H19-04: limite exato de antecedência e preparo maior impedem encaixe', async () => {
  for (const [hours, preparation] of [
    [6, 0],
    [24, 24],
  ]) {
    const x = await reservation(hours ?? 0, true, preparation);
    await job.syncClinic(x.row.id, NOW);
    assert.equal(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: x.booking.id },
        })
      ).state,
      'cancelada',
    );
    assert.equal(
      await prisma.vacancy.count({ where: { slotId: x.slot.id } }),
      0,
    );
  }
});

test('H19-03: evento movido cancela e publica original sem alterar as FKs', async () => {
  const x = await reservation(24);
  x.fake.events.push({
    id: 'event-original',
    description: `reservationId=${x.booking.id}`,
    start: {
      dateTime: new Date(x.slot.startsAt.getTime() + HOUR).toISOString(),
    },
    end: { dateTime: new Date(x.slot.endsAt.getTime() + HOUR).toISOString() },
  });
  await job.syncClinic(x.row.id, NOW);
  assert.equal(
    (
      await prisma.reservation.findUniqueOrThrow({
        where: { id: x.booking.id },
      })
    ).state,
    'cancelada',
  );
  assert.equal(
    (
      await prisma.slot.findUniqueOrThrow({ where: { id: x.slot.id } })
    ).startsAt.toISOString(),
    x.slot.startsAt.toISOString(),
  );
  assert.equal(
    (await prisma.exam.findUniqueOrThrow({ where: { id: x.exam.id } }))
      .clinicId,
    x.row.id,
  );
  assert.equal(
    await prisma.vacancy.count({
      where: { slotId: x.slot.id, state: 'publicada' },
    }),
    1,
  );
});

test('H19-02/10: reserva sem evento cria título e marcador, ignora evento manual e não duplica no tick seguinte', async () => {
  const x = await reservation(24, false);
  x.fake.events.push({
    id: 'manual',
    start: { dateTime: x.slot.startsAt.toISOString() },
    end: { dateTime: x.slot.endsAt.toISOString() },
  });
  await job.syncClinic(x.row.id, NOW);
  await job.syncClinic(x.row.id, NOW);
  assert.equal(x.fake.inserts.length, 1);
  const event = x.fake.inserts[0]?.requestBody;
  assert.equal(event?.summary, `[${x.exam.tussCode}] Teste paciente`);
  assert.equal(event?.description, `reservationId=${x.booking.id}`);
  assert.equal(
    (
      await prisma.reservation.findUniqueOrThrow({
        where: { id: x.booking.id },
      })
    ).state,
    'confirmada',
  );
  assert.equal(
    await prisma.transition.count({
      where: { reservationId: x.booking.id, toState: 'cancelada' },
    }),
    0,
  );
});

test('H19-02: evento confirmado pelo Google antes de falha local é recuperado pelo marcador sem nova criação', async () => {
  const x = await reservation(24, false);
  x.fake.events.push({
    id: x.booking.id.replaceAll('-', ''),
    description: `reservationId=${x.booking.id}`,
    start: { dateTime: x.slot.startsAt.toISOString() },
    end: { dateTime: x.slot.endsAt.toISOString() },
  });
  await job.syncClinic(x.row.id, NOW);
  assert.equal(x.fake.inserts.length, 0);
  assert.equal(
    (
      await prisma.reservation.findUniqueOrThrow({
        where: { id: x.booking.id },
      })
    ).googleEventId,
    x.booking.id.replaceAll('-', ''),
  );
});

test('H19-05: token revogado desconecta e avisa clínica com zero efeitos no domínio', async () => {
  const x = await reservation(24);
  x.fake.fail = Object.assign(new Error('credenciais recusadas'), {
    response: { status: 401 },
  });
  const beforeEmails = emails.length;
  await job.syncClinic(x.row.id, NOW);
  assert.equal(
    (
      await prisma.calendarConnection.findUniqueOrThrow({
        where: { clinicId: x.row.id },
      })
    ).status,
    'EXPIRED',
  );
  assert.equal(
    (
      await prisma.reservation.findUniqueOrThrow({
        where: { id: x.booking.id },
      })
    ).state,
    'confirmada',
  );
  assert.equal(await prisma.vacancy.count({ where: { slotId: x.slot.id } }), 0);
  assert.equal(
    await prisma.transition.count({ where: { reservationId: x.booking.id } }),
    0,
  );
  assert.equal(emails.length - beforeEmails, 1);
  assert.equal(emails.at(-1)?.subject, 'Sua agenda foi desconectada');
});

test('H19-01/05: falha na segunda página não aplica snapshot parcial nem cria evento', async () => {
  const x = await reservation(24, false);
  x.fake.secondPageFail = true;
  await job.syncClinic(x.row.id, NOW);
  assert.equal(x.fake.lists.length, 2);
  assert.equal(x.fake.inserts.length, 0);
  assert.equal(
    (
      await prisma.calendarConnection.findUniqueOrThrow({
        where: { clinicId: x.row.id },
      })
    ).status,
    'EXPIRED',
  );
  assert.equal(
    (
      await prisma.reservation.findUniqueOrThrow({
        where: { id: x.booking.id },
      })
    ).googleEventId,
    null,
  );
});

test('H19-01/06: próximos 14 dias materializam só intervalos livres no expediente local, sem duplicar', async () => {
  const x = await clinic();
  await prisma.clinicOpeningHours.create({
    data: { clinicId: x.row.id, weekday: 1, startMinute: 480, endMinute: 600 },
  });
  x.fake.events.push({
    id: 'manual',
    start: { dateTime: '2026-11-09T11:00:00Z' },
    end: { dateTime: '2026-11-09T11:30:00Z' },
  });
  await job.syncClinic(x.row.id, NOW);
  await job.syncClinic(x.row.id, NOW);
  const slots = await prisma.slot.findMany({
    where: { clinicId: x.row.id },
    orderBy: { startsAt: 'asc' },
  });
  assert.equal(slots.length, 7);
  assert.equal(slots[0]?.startsAt.toISOString(), '2026-11-09T11:30:00.000Z');
  assert.equal(slots.at(-1)?.endsAt.toISOString(), '2026-11-16T13:00:00.000Z');
  assert.equal(
    await prisma.vacancy.count({ where: { slot: { clinicId: x.row.id } } }),
    0,
  );
  assert.equal(x.fake.lists[0]?.timeMin, NOW.toISOString());
  assert.equal(x.fake.lists[0]?.timeMax, '2026-11-22T10:00:00.000Z');
});

test('H19-06: evento de dia inteiro bloqueia expediente e disponibilidade antiga sem histórico é removida', async () => {
  const x = await clinic();
  await prisma.clinicOpeningHours.create({
    data: { clinicId: x.row.id, weekday: 1, startMinute: 480, endMinute: 540 },
  });
  await job.syncClinic(x.row.id, NOW);
  assert.equal(await prisma.slot.count({ where: { clinicId: x.row.id } }), 4);
  x.fake.events.push({
    id: 'dia-inteiro',
    start: { date: '2026-11-09' },
    end: { date: '2026-11-10' },
  });
  await job.syncClinic(x.row.id, NOW);
  assert.equal(await prisma.slot.count({ where: { clinicId: x.row.id } }), 2);
});

test('H19-04: teto diário impede publicação mas preserva cancelamento e aviso', async () => {
  const x = await reservation(24);
  await prisma.clinic.update({
    where: { id: x.row.id },
    data: { dailyDiscountCap: 0 },
  });
  await job.syncClinic(x.row.id, NOW);
  assert.equal(
    (
      await prisma.reservation.findUniqueOrThrow({
        where: { id: x.booking.id },
      })
    ).state,
    'cancelada',
  );
  assert.equal(await prisma.vacancy.count({ where: { slotId: x.slot.id } }), 0);
});

test('H19-03/04: encaixe reservado é fechado antes da vaga nova, preservando histórico', async () => {
  const x = await reservation(24);
  const old = await prisma.vacancy.create({
    data: {
      slotId: x.slot.id,
      origin: 'vazio',
      state: 'reservada',
      currentPriceCents: 20000,
    },
  });
  await prisma.reservation.update({
    where: { id: x.booking.id },
    data: { type: 'encaixe', vacancyId: old.id, paymentMethod: 'pix' },
  });
  await job.syncClinic(x.row.id, NOW);
  assert.equal(
    (await prisma.vacancy.findUniqueOrThrow({ where: { id: old.id } })).state,
    'cancelada',
  );
  assert.equal(
    await prisma.vacancy.count({
      where: { slotId: x.slot.id, state: 'publicada' },
    }),
    1,
  );
  assert.equal(
    await prisma.transition.count({
      where: { vacancyId: old.id, toState: 'cancelada', origin: 'agenda' },
    }),
    1,
  );
  assert.equal(
    (
      await prisma.reservation.findUniqueOrThrow({
        where: { id: x.booking.id },
      })
    ).vacancyId,
    old.id,
  );
});

test('H19-05: troca de agenda durante a leitura descarta o snapshot anterior', async () => {
  const x = await reservation(24);
  x.fake.onList = async () => {
    await prisma.calendarConnection.update({
      where: { clinicId: x.row.id },
      data: { calendarId: 'outra-agenda' },
    });
  };
  await job.syncClinic(x.row.id, NOW);
  assert.equal(
    (
      await prisma.reservation.findUniqueOrThrow({
        where: { id: x.booking.id },
      })
    ).state,
    'confirmada',
  );
  assert.equal(await prisma.vacancy.count({ where: { slotId: x.slot.id } }), 0);
});
