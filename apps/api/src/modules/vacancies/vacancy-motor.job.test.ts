import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, afterEach, before, mock, test } from 'node:test';
import { type INestApplication, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { createApp } from '../../app';
import { APP_ENV, type AppEnv } from '../../config/env';
import type {
  Clinic,
  Exam,
  Subscription,
  Vacancy,
  VacancyState,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createSchemaFixtures, examData } from '../../testing/schema-fixtures';
import { ClockService } from '../clock/clock.service';
import type {
  AlertContext,
  ChannelAdapter,
  NotificationMessage,
} from '../notifications/notification.types';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MatchingService } from './matching.service';
import { haversineMeters, localDayStart } from './matching-rules';
import { currentPriceCents } from './price-engine';
import { PricingService } from './pricing.service';
import { VacanciesService } from './vacancies.service';
import { VACANCY_MOTOR_JOB, VacancyMotorJob } from './vacancy-motor.job';
import { WavesService } from './waves.service';

/**
 * Motor de vagas do HACK-32 (checks.md) contra o Postgres do worktree. A app é a
 * de `createApp`, com o cron real desligado (`VACANCY_MOTOR_ENABLED=false` no
 * script de teste); o `WavesService` e o `VacancyMotorJob` testados são montados
 * pelo construtor com os serviços reais da app e um `NotificationsService` com
 * adapters de teste: nenhum envio real. O `tick` é global, então cada asserção olha
 * só para as vagas criadas aqui, e cada teste fecha as suas vagas ao terminar.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const KM_LAT = 1 / 111.195;
// Sábado 16/01/2027, 10h em São Paulo; t0 três dias antes.
const SAT_10H = new Date('2027-01-16T13:00:00Z');
const T0 = new Date('2027-01-13T13:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * MINUTE);
const SAT_MORNING = [{ weekday: 6, startMinute: 9 * 60, endMinute: 12 * 60 }];
const ALL_DAY = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinute: 0,
  endMinute: 24 * 60,
}));
const KNEE_STEPS = [
  { leadMinutes: 48 * 60, discountPercent: 10 },
  { leadMinutes: 24 * 60, discountPercent: 20 },
  { leadMinutes: 6 * 60, discountPercent: 30 },
];

type Send = {
  patientId: string;
  message: NotificationMessage;
  context: AlertContext;
};

let app: INestApplication;
let prisma: PrismaService;
let clock: ClockService;
let vacancies: VacanciesService;
let matching: MatchingService;
let pricing: PricingService;
let env: AppEnv;
let notifications: NotificationsService;
let waves: WavesService;
let job: VacancyMotorJob;
let fixtures: ReturnType<typeof createSchemaFixtures>;

const sends: Send[] = [];
let enviarHook: ((send: Send) => Promise<void>) | null = null;
let adapterHook: (() => Promise<void>) | null = null;
const prices: { vagaId: string; precoCentavos: number }[] = [];
const published: { vagaId: string; userIds: string[] }[] = [];
let publishedHook: (() => void) | null = null;
const ownVacancies: string[] = [];
let tussSeq = 0;
let slotSeq = 0;

before(async () => {
  app = await createApp({ logger: false });
  await app.init(); // registra os crons, como o boot faz no listen
  prisma = app.get(PrismaService);
  clock = app.get(ClockService);
  vacancies = app.get(VacanciesService);
  matching = app.get(MatchingService);
  pricing = app.get(PricingService);
  env = app.get<AppEnv>(APP_ENV);
  fixtures = createSchemaFixtures(prisma);
  await clock.reset();

  // Sem adapter de WhatsApp: o paciente só com esse canal recebe `sem_canal` (C35).
  const adapters: ChannelAdapter[] = (['push', 'email'] as const).map(
    (channel) => ({
      channel,
      send: async () => {
        if (adapterHook) await adapterHook();
      },
    }),
  );
  notifications = new NotificationsService(prisma, adapters);
  const realEnviar = notifications.enviar.bind(notifications);
  notifications.enviar = async (patientId, message, context) => {
    const send = { patientId, message, context };
    sends.push(send);
    if (enviarHook) await enviarHook(send);
    return realEnviar(patientId, message, context);
  };

  const realtime = app.get(RealtimeService);
  realtime.vagaPreco = (input) => {
    prices.push(input);
  };
  realtime.vagaPublicada = (input, userIds) => {
    published.push({ vagaId: input.vagaId, userIds });
    if (publishedHook) publishedHook();
  };

  waves = new WavesService(
    prisma,
    vacancies,
    matching,
    notifications,
    realtime,
    env,
  );
  job = new VacancyMotorJob(clock, pricing, vacancies, notifications, waves, {
    ...env,
    VACANCY_MOTOR_ENABLED: true,
  });
});

afterEach(async () => {
  enviarHook = null;
  adapterHook = null;
  publishedHook = null;
  // Fecha as vagas do teste, para o próximo tick não mexer nelas.
  await prisma.vacancy.updateMany({
    where: {
      id: { in: ownVacancies },
      state: { in: ['publicada', 'alertando', 'reservada'] },
    },
    data: { state: 'cancelada' },
  });
});

after(async () => {
  await clock.reset();
  const ownClinic = { clinic: { userId: { in: fixtures.userIds } } };
  const ownVacancy = { vacancy: { slot: ownClinic } };
  await prisma.alert.deleteMany({ where: ownVacancy });
  await prisma.transition.deleteMany({ where: ownVacancy });
  await prisma.subscription.deleteMany({
    where: { patient: { userId: { in: fixtures.userIds } } },
  });
  await prisma.vacancy.deleteMany({ where: { slot: ownClinic } });
  await prisma.slot.deleteMany({ where: ownClinic });
  await prisma.exam.deleteMany({ where: ownClinic });
  await prisma.patient.deleteMany({
    where: { userId: { in: fixtures.userIds } },
  });
  await prisma.clinic.deleteMany({
    where: { userId: { in: fixtures.userIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: fixtures.userIds } } });
  await app.close();
});

// --- fixtures -----------------------------------------------------------------

interface ExamOptions {
  fullPriceCents?: number;
  floorPriceCents?: number;
  steps?: boolean;
  preparation?: string;
  name?: string;
  lead?: boolean;
}

async function createExam(options: ExamOptions = {}): Promise<{
  clinic: Clinic;
  exam: Exam;
}> {
  const clinic = await fixtures.createClinic();
  const exam = await prisma.exam.create({
    data: {
      ...examData(clinic.id, {
        tussCode: `5${String(++tussSeq).padStart(7, '0')}`,
        fullPriceCents: options.fullPriceCents ?? 30000,
        floorPriceCents: options.floorPriceCents ?? 18000,
        ...(options.lead === false
          ? { minLeadMinutes: 0, preparationHours: 0 }
          : {}),
      }),
      ...(options.preparation === undefined
        ? {}
        : { preparationCondition: options.preparation }),
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(options.steps ? { priceSteps: { create: KNEE_STEPS } } : {}),
    },
  });
  return { clinic, exam };
}

interface VacancyOptions extends ExamOptions {
  startsAt?: Date;
  state?: VacancyState;
  priceCents?: number;
}

/** Vaga gravada direto no estado pedido; horário padrão no sábado de manhã. */
async function createVacancy(options: VacancyOptions = {}) {
  const { clinic, exam } = await createExam(options);
  const startsAt =
    options.startsAt ?? new Date(SAT_10H.getTime() + (++slotSeq % 60) * MINUTE);
  const slot = await prisma.slot.create({
    data: {
      clinicId: clinic.id,
      examId: exam.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * MINUTE),
      origin: 'manual',
    },
  });
  const vacancy = await prisma.vacancy.create({
    data: {
      slotId: slot.id,
      origin: 'vazio',
      state: options.state ?? 'publicada',
      currentPriceCents: options.priceCents ?? 25000,
    },
  });
  ownVacancies.push(vacancy.id);
  return { clinic, exam, vacancy };
}

let subscriptionClock = Date.now() - 24 * HOUR;

/** `n` inscrições compatíveis, de pacientes distintos, em ordem de `createdAt`. */
async function subscribe(
  clinic: Clinic,
  exam: Exam,
  n: number,
  options: {
    kmNorth?: (index: number) => number;
    windows?: typeof SAT_MORNING;
    maxPriceCents?: number;
  } = {},
): Promise<Subscription[]> {
  const created: Subscription[] = [];
  for (let i = 0; i < n; i += 1) {
    const patient = await fixtures.createPatient();
    subscriptionClock += 1000;
    created.push(
      await prisma.subscription.create({
        data: {
          patientId: patient.id,
          tussCode: exam.tussCode,
          maxPriceCents: options.maxPriceCents ?? 30000,
          latitude: clinic.latitude + (options.kmNorth?.(i) ?? 0) * KM_LAT,
          longitude: clinic.longitude,
          radiusMeters: 10_000,
          expiresAt: new Date('2027-12-31T00:00:00Z'),
          createdAt: new Date(subscriptionClock),
          windows: { create: options.windows ?? SAT_MORNING },
        },
      }),
    );
  }
  return created;
}

async function scenario(n: number, options: VacancyOptions = {}) {
  const created = await createVacancy(options);
  const subscriptions = await subscribe(created.clinic, created.exam, n);
  return { ...created, subscriptions };
}

/** Envios desta vaga feitos durante `run`. */
async function sendsDuring(vacancyId: string, run: () => Promise<unknown>) {
  const start = sends.length;
  await run();
  return sends.slice(start).filter((s) => s.context.vacancyId === vacancyId);
}

const waveTransitions = (vacancyId: string) =>
  prisma.transition.findMany({
    where: { vacancyId, toState: 'alertando' },
    orderBy: { occurredAt: 'asc' },
  });

const stateOf = async (id: string) =>
  (await prisma.vacancy.findUniqueOrThrow({ where: { id } })).state;

async function alertedSubscriptions(vacancyId: string) {
  const alerts = await prisma.alert.findMany({ where: { vacancyId } });
  return new Set(alerts.map((a) => a.subscriptionId));
}

type LogLine = { level: string; context: string; text: string };

/** Captura as linhas do `Logger` do Nest durante o teste, sem imprimir. */
function captureLogs(t: { mock: typeof mock }): LogLine[] {
  const lines: LogLine[] = [];
  for (const level of ['log', 'warn', 'error'] as const) {
    t.mock.method(
      Logger.prototype,
      level,
      function (this: Logger, ...args: unknown[]) {
        lines.push({
          level,
          context: String(
            (this as unknown as { context?: string }).context ?? '',
          ),
          text: args.map(String).join(' '),
        });
      },
    );
  }
  return lines;
}

// S1 - ondas de N a cada Z, sem repetir ------------------------------------------

test('C1 - primeira onda alerta os N primeiros na ordem do matching', async () => {
  const { vacancy, subscriptions } = await scenario(7);
  const sent = await sendsDuring(vacancy.id, () => job.tick(T0));
  assert.deepEqual(
    sent.map((s) => s.context.subscriptionId),
    subscriptions.slice(0, 5).map((s) => s.id),
  );
  const rows = await waveTransitions(vacancy.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.fromState, 'publicada');
  assert.equal(rows[0]?.origin, 'motor');
});

/** O cenário do card: 12 candidatos, ticks em t0, +10, +20, +30 e +40. */
async function cardWaves() {
  const s = await scenario(12);
  const ids = s.subscriptions.map((sub) => sub.id);
  const perTick: string[][] = [];
  const transitionsAfter: number[] = [];
  for (const minute of [0, 10, 20, 30, 40]) {
    const sent = await sendsDuring(s.vacancy.id, () => job.tick(at(minute)));
    perTick.push(sent.map((x) => x.context.subscriptionId));
    transitionsAfter.push(
      await prisma.transition.count({ where: { vacancyId: s.vacancy.id } }),
    );
  }
  return { ...s, ids, perTick, transitionsAfter };
}

test('C2 - 12 candidatos com N 5 viram ondas de 5, 5 e 2', async () => {
  const { vacancy, ids, perTick } = await cardWaves();
  assert.deepEqual(perTick, [
    ids.slice(0, 5),
    ids.slice(5, 10),
    ids.slice(10, 12),
    [],
    [],
  ]);
  const alerts = await prisma.alert.findMany({
    where: { vacancyId: vacancy.id },
  });
  const waveOf = new Map(alerts.map((a) => [a.subscriptionId, a.wave]));
  ids.forEach((id, index) => {
    assert.equal(
      waveOf.get(id),
      index < 5 ? 1 : index < 10 ? 2 : 3,
      `inscrição ${index + 1}`,
    );
  });
});

test('C3 - dentro da janela Z a vaga em alertando não recebe onda', async (t) => {
  const { vacancy } = await scenario(12);
  await job.tick(T0);
  const before = await prisma.transition.count({
    where: { vacancyId: vacancy.id },
  });
  const candidatos = t.mock.method(matching, 'candidatos');
  const sent = await sendsDuring(vacancy.id, () => job.tick(at(9)));
  assert.deepEqual(sent, []);
  assert.equal(
    candidatos.mock.calls.filter((call) => call.arguments[0] === vacancy.id)
      .length,
    0,
  );
  assert.equal(
    await prisma.transition.count({ where: { vacancyId: vacancy.id } }),
    before,
  );
});

test('C4 - onda seguinte grava alertando para alertando', async () => {
  const { vacancy } = await scenario(12);
  await job.tick(T0);
  await job.tick(at(10));
  const rows = await waveTransitions(vacancy.id);
  assert.equal(rows.length, 2);
  const second = rows[1];
  assert.equal(second?.fromState, 'alertando');
  assert.equal(second?.toState, 'alertando');
  assert.equal(second?.origin, 'motor');
});

test('C5 - fila esgotada volta a publicada e depois para', async () => {
  const { vacancy, perTick, transitionsAfter } = await cardWaves();
  const t4 = await prisma.transition.findMany({
    where: {
      vacancyId: vacancy.id,
      fromState: 'alertando',
      toState: 'publicada',
    },
  });
  assert.equal(t4.length, 1);
  assert.equal(t4[0]?.origin, 'motor');
  assert.equal(
    transitionsAfter[3]! - transitionsAfter[2]!,
    1,
    'o t0+30 grava só o T4',
  );
  assert.equal(
    transitionsAfter[4],
    transitionsAfter[3],
    'o t0+40 não grava nada',
  );
  assert.deepEqual(perTick[4], []);
  assert.equal(await stateOf(vacancy.id), 'publicada');
});

test('C6 - tick repetido não repete a onda', async () => {
  const { vacancy } = await scenario(12);
  await job.tick(T0);
  await job.tick(T0);
  assert.equal((await waveTransitions(vacancy.id)).length, 1);
  assert.equal((await alertedSubscriptions(vacancy.id)).size, 5);
  const alerts = await prisma.alert.findMany({
    where: { vacancyId: vacancy.id },
  });
  const keys = new Set(alerts.map((a) => `${a.subscriptionId}/${a.channel}`));
  assert.equal(alerts.length, keys.size);
});

test('C7 - dois ticks concorrentes gravam uma onda só', async () => {
  for (let round = 0; round < 10; round += 1) {
    const { vacancy } = await scenario(12);
    const results = await Promise.allSettled([
      waves.dispatchDue(T0),
      waves.dispatchDue(T0),
    ]);
    assert.deepEqual(
      results.map((r) => r.status),
      ['fulfilled', 'fulfilled'],
      `rodada ${round}`,
    );
    assert.equal(
      (await waveTransitions(vacancy.id)).length,
      1,
      `rodada ${round}`,
    );
    assert.equal(
      (await alertedSubscriptions(vacancy.id)).size,
      5,
      `rodada ${round}`,
    );
    await prisma.vacancy.update({
      where: { id: vacancy.id },
      data: { state: 'cancelada' },
    });
  }
});

test('C7 (extra) - dois ticks concorrentes na onda seguinte gravam uma onda só', async () => {
  // Ressalva 1 do HACK-29: alertando → alertando tem o mesmo estado de origem nos
  // dois ticks, então só a trava da vaga separa as duas chamadas.
  for (let round = 0; round < 10; round += 1) {
    const { vacancy } = await scenario(12);
    await waves.dispatchDue(T0);
    await Promise.all([waves.dispatchDue(at(10)), waves.dispatchDue(at(10))]);
    assert.equal(
      (await waveTransitions(vacancy.id)).length,
      2,
      `rodada ${round}`,
    );
    assert.equal(
      (await alertedSubscriptions(vacancy.id)).size,
      10,
      `rodada ${round}`,
    );
    await prisma.vacancy.update({
      where: { id: vacancy.id },
      data: { state: 'cancelada' },
    });
  }
});

test('C8 - vaga travada é pulada no tick sem esperar', async (t) => {
  const { vacancy } = await scenario(7);
  const candidatos = t.mock.method(matching, 'candidatos');
  let sentWhileLocked: Send[] = [];
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Vacancy" WHERE id = ${vacancy.id}::uuid FOR UPDATE`;
      sentWhileLocked = await sendsDuring(vacancy.id, () =>
        waves.dispatchDue(T0),
      );
    },
    { timeout: 15_000 },
  );
  assert.deepEqual(sentWhileLocked, []);
  assert.equal(
    candidatos.mock.calls.filter((call) => call.arguments[0] === vacancy.id)
      .length,
    0,
  );
  assert.equal((await waveTransitions(vacancy.id)).length, 0);

  const sent = await sendsDuring(vacancy.id, () => waves.dispatchDue(T0));
  assert.equal(sent.length, 5);
  assert.equal((await waveTransitions(vacancy.id)).length, 1);
});

test('C9 - vaga fora de publicada e alertando não recebe onda', async (t) => {
  const closed: Vacancy[] = [];
  for (const state of [
    'reservada',
    'realizada',
    'expirada',
    'cancelada',
  ] as const) {
    closed.push((await scenario(3, { state })).vacancy);
  }
  const candidatos = t.mock.method(matching, 'candidatos');
  const start = sends.length;
  await job.tick(T0);
  const ids = new Set(closed.map((v) => v.id));
  assert.equal(
    candidatos.mock.calls.filter((call) => ids.has(String(call.arguments[0])))
      .length,
    0,
  );
  assert.equal(
    sends.slice(start).filter((s) => ids.has(s.context.vacancyId)).length,
    0,
  );
  assert.equal(
    await prisma.transition.count({ where: { vacancyId: { in: [...ids] } } }),
    0,
  );
});

test('C10 - inscrição nova depois do esgotamento recebe a onda seguinte', async () => {
  const s = await scenario(12);
  for (const minute of [0, 10, 20, 30]) await job.tick(at(minute));
  assert.equal(await stateOf(s.vacancy.id), 'publicada');
  const [late] = await subscribe(s.clinic, s.exam, 1);
  const before = await waveTransitions(s.vacancy.id);
  const sent = await sendsDuring(s.vacancy.id, () => job.tick(at(40)));
  assert.deepEqual(
    sent.map((x) => x.context.subscriptionId),
    [late!.id],
  );
  assert.deepEqual(
    sent.map((x) => x.context.wave),
    [4],
  );
  const alerts = await prisma.alert.findMany({
    where: { vacancyId: s.vacancy.id, subscriptionId: late!.id },
  });
  assert.ok(alerts.length > 0);
  assert.ok(alerts.every((a) => a.wave === 4));
  const after = await waveTransitions(s.vacancy.id);
  assert.equal(after.length, before.length + 1);
  assert.equal(after.at(-1)?.fromState, 'publicada');
  assert.equal(after.at(-1)?.origin, 'motor');
});

test('C11 - mensagem da onda leva os dados da vaga e a distância de cada paciente', async () => {
  const withPrep = await createVacancy({
    preparation: 'jejum de 8 h',
    name: 'RM de joelho',
  });
  const noPrep = await createVacancy({ preparation: '' });
  const subs = await subscribe(withPrep.clinic, withPrep.exam, 2, {
    kmNorth: (i) => i + 1,
  });
  await subscribe(noPrep.clinic, noPrep.exam, 1);
  const start = sends.length;
  await job.tick(T0);
  const sent = sends.slice(start);

  const mine = sent.filter((s) => s.context.vacancyId === withPrep.vacancy.id);
  assert.equal(mine.length, 2);
  const patientOf = new Map(subs.map((s) => [s.id, s.patientId]));
  for (const send of mine) {
    const sub = subs.find((s) => s.id === send.context.subscriptionId)!;
    assert.equal(send.patientId, patientOf.get(sub.id));
    assert.deepEqual(send.context, {
      vacancyId: withPrep.vacancy.id,
      subscriptionId: sub.id,
      wave: 1,
    });
    assert.deepEqual(send.message, {
      clinicName: withPrep.clinic.name,
      examName: 'RM de joelho',
      startsAt: (
        await prisma.slot.findUniqueOrThrow({
          where: { id: withPrep.vacancy.slotId },
        })
      ).startsAt,
      priceCents: 25000,
      preparation: 'jejum de 8 h',
      vacancyUrl: `${env.WEB_ORIGIN}/vagas/${withPrep.vacancy.id}`,
      distanceMeters: haversineMeters(sub, withPrep.clinic),
    });
  }
  assert.notEqual(
    mine[0]?.message.distanceMeters,
    mine[1]?.message.distanceMeters,
  );

  const other = sent.filter((s) => s.context.vacancyId === noPrep.vacancy.id);
  assert.equal(other.length, 1);
  assert.equal(other[0]?.message.preparation, null);
});

test('C12 - a marca da onda é confirmada antes do envio', async () => {
  const { vacancy } = await scenario(5);
  const seen: number[] = [];
  let first = true;
  adapterHook = async () => {
    // Os canais rodam em paralelo: só a primeira chamada lê o banco.
    if (first) {
      first = false;
      seen.push(
        await prisma.transition.count({
          where: { vacancyId: vacancy.id, toState: 'alertando' },
        }),
      );
    }
  };
  await waves.dispatchDue(T0);
  assert.deepEqual(seen, [1]);
});

test('C35 - onda pula paciente só com sem_canal e conta até N', async () => {
  const { vacancy, subscriptions } = await scenario(7);
  for (const sub of subscriptions.slice(0, 2)) {
    await prisma.patient.update({
      where: { id: sub.patientId },
      data: { alertChannels: ['whatsapp'], phoneVerifiedAt: new Date() },
    });
  }
  const start = published.length;
  const sent = await sendsDuring(vacancy.id, () => job.tick(T0));
  assert.deepEqual(
    sent.map((s) => s.context.subscriptionId),
    subscriptions.map((s) => s.id),
  );
  const alerts = await prisma.alert.findMany({
    where: { vacancyId: vacancy.id },
  });
  assert.ok(alerts.every((a) => a.wave === 1));
  // As inscrições 1 e 2 têm só o `Alert` `sem_canal` que o dono grava (HACK-48).
  for (const sub of subscriptions.slice(0, 2)) {
    const own = alerts.filter((a) => a.subscriptionId === sub.id);
    assert.deepEqual(
      own.map((a) => [a.channel, a.result]),
      [['whatsapp', 'sem_canal']],
    );
  }
  const delivered = new Set(
    alerts.filter((a) => a.result === 'enviado').map((a) => a.subscriptionId),
  );
  assert.deepEqual(
    [...delivered].sort(),
    subscriptions
      .slice(2)
      .map((s) => s.id)
      .sort(),
  );
  const counted = await prisma.patient.findMany({
    where: { id: { in: subscriptions.slice(2).map((s) => s.patientId) } },
  });
  const calls = published.slice(start).filter((p) => p.vagaId === vacancy.id);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    new Set(calls[0]!.userIds),
    new Set(counted.map((p) => p.userId)),
  );
});

// S2 - falha isolada ------------------------------------------------------------

test('C13 - falha no envio de um paciente não para os outros', async () => {
  const { vacancy, subscriptions } = await scenario(5);
  const third = subscriptions[2]!.id;
  enviarHook = async (send) => {
    if (send.context.subscriptionId === third)
      throw new Error('envio forçado a falhar');
  };
  const sent = await sendsDuring(vacancy.id, () => job.tick(T0));
  assert.equal(sent.length, 5);
  const alerted = await alertedSubscriptions(vacancy.id);
  assert.equal(alerted.size, 4);
  assert.ok(!alerted.has(third));
  assert.equal((await waveTransitions(vacancy.id)).length, 1);
});

test('C14 - falha de uma vaga não para a onda das outras e o log não tem dado pessoal', async (t) => {
  const marker = randomUUID();
  const a = await scenario(5);
  const b = await scenario(5, { name: `Exame ${marker}` });
  const c = await scenario(5);
  const people = await prisma.patient.findMany({
    where: { id: { in: b.subscriptions.map((s) => s.patientId) } },
    include: { user: true },
  });
  for (const [i, p] of people.entries()) {
    await prisma.user.update({
      where: { id: p.userId },
      data: { name: `Paciente ${marker}-${i}` },
    });
  }
  const realCandidatos = matching.candidatos.bind(matching);
  t.mock.method(
    matching,
    'candidatos',
    async (vacancyId: string, now: Date) => {
      if (vacancyId === b.vacancy.id)
        throw new Error('candidatos forçado a falhar');
      return realCandidatos(vacancyId, now);
    },
  );
  const logs = captureLogs(t);
  const start = sends.length;
  await job.tick(T0);
  const sent = sends.slice(start);
  for (const ok of [a, c]) {
    assert.equal(
      sent.filter((s) => s.context.vacancyId === ok.vacancy.id).length,
      5,
    );
    assert.equal((await waveTransitions(ok.vacancy.id)).length, 1);
  }
  assert.equal(
    await prisma.transition.count({ where: { vacancyId: b.vacancy.id } }),
    0,
  );
  const lines = logs.filter(
    (l) =>
      (l.level === 'warn' || l.level === 'error') &&
      l.text.includes(b.vacancy.id),
  );
  assert.equal(lines.length, 1);
  const forbidden = [marker, ...people.flatMap((p) => [p.user.email, p.phone])];
  for (const word of forbidden) {
    assert.ok(!lines[0]!.text.includes(word), `log com ${word}`);
  }
});

test('C15 - etapa que falha não impede as seguintes', async (t) => {
  const NOW = new Date(SAT_10H.getTime() - 30 * HOUR);
  const steps = ['prices', 'expire', 'cancel-pending', 'waves'] as const;
  for (const failing of steps) {
    // Uma vaga para cada etapa observar.
    const price = await createVacancy({
      steps: true,
      fullPriceCents: 72000,
      floorPriceCents: 50000,
      priceCents: 72000,
      startsAt: SAT_10H,
    });
    const due = await createVacancy({
      startsAt: new Date(NOW.getTime() - HOUR),
    });
    // Estado final (continuação, 08/11): reservada não cancela mais pendentes.
    const closed = await scenario(1, { state: 'realizada' });
    const pending = await prisma.alert.create({
      data: {
        vacancyId: closed.vacancy.id,
        subscriptionId: closed.subscriptions[0]!.id,
        wave: 1,
        channel: 'push',
      },
    });
    const wave = await scenario(5, {
      startsAt: new Date(SAT_10H.getTime() + (++slotSeq % 60) * MINUTE),
    });

    const forced = new Error(`etapa ${failing} forçada a falhar`);
    const reject = async () => {
      throw forced;
    };
    const target = {
      prices: () => t.mock.method(pricing, 'recalculatePrices', reject),
      expire: () => t.mock.method(vacancies, 'expireDue', reject),
      'cancel-pending': () =>
        t.mock.method(
          notifications,
          'cancelPendingOfFinishedVacancies',
          reject,
        ),
      waves: () => t.mock.method(waves, 'dispatchDue', reject),
    }[failing]();
    const logs = captureLogs(t);
    await assert.doesNotReject(job.tick(NOW));
    assert.equal(target.mock.callCount(), 1);
    t.mock.restoreAll();

    const ran = {
      prices:
        (
          await prisma.vacancy.findUniqueOrThrow({
            where: { id: price.vacancy.id },
          })
        ).currentPriceCents < 72000,
      expire: (await stateOf(due.vacancy.id)) === 'expirada',
      'cancel-pending':
        (await prisma.alert.findUniqueOrThrow({ where: { id: pending.id } }))
          .result === 'cancelado',
      waves: (await waveTransitions(wave.vacancy.id)).length === 1,
    };
    for (const step of steps) {
      assert.equal(
        ran[step],
        step !== failing,
        `${failing} falhou; ${step} rodou?`,
      );
    }
    assert.ok(
      logs.some((l) => l.text.includes(`etapa ${failing} falhou`)),
      `linha da etapa ${failing}`,
    );
    await prisma.vacancy.updateMany({
      where: {
        id: {
          in: [
            price.vacancy.id,
            due.vacancy.id,
            closed.vacancy.id,
            wave.vacancy.id,
          ],
        },
        state: { in: ['publicada', 'alertando', 'reservada'] },
      },
      data: { state: 'cancelada' },
    });
  }
});

// S3 - expiração no tick, antes da onda -----------------------------------------

test('C17 - vaga vencida expira no tick sem receber onda', async () => {
  const startsAt = at(5);
  const alerting = await scenario(7, {
    state: 'alertando',
    startsAt,
    lead: false,
  });
  await prisma.transition.create({
    data: {
      vacancyId: alerting.vacancy.id,
      fromState: 'publicada',
      toState: 'alertando',
      origin: 'motor',
      reason: 'onda 1 da fixture',
      occurredAt: T0,
    },
  });
  const publishedVacancy = await scenario(7, { startsAt, lead: false });
  const ids = [alerting.vacancy.id, publishedVacancy.vacancy.id];
  const before = await prisma.transition.findMany({
    where: { vacancyId: { in: ids } },
  });
  const alertsBefore = await prisma.alert.count({
    where: { vacancyId: { in: ids } },
  });
  const start = sends.length;

  await job.tick(at(10));

  for (const id of ids) {
    assert.equal(await stateOf(id), 'expirada');
    const fresh = (
      await prisma.transition.findMany({ where: { vacancyId: id } })
    ).filter((row) => !before.some((old) => old.id === row.id));
    assert.deepEqual(
      fresh.map((row) => row.toState),
      ['expirada'],
    );
  }
  assert.equal(
    await prisma.alert.count({ where: { vacancyId: { in: ids } } }),
    alertsBefore,
  );
  assert.equal(
    sends.slice(start).filter((s) => ids.includes(s.context.vacancyId)).length,
    0,
  );
});

test('C18 - pendente da vaga que expira é cancelado no mesmo tick', async () => {
  const { vacancy, subscriptions } = await scenario(1, {
    state: 'alertando',
    startsAt: at(5),
  });
  const pending = await prisma.alert.create({
    data: {
      vacancyId: vacancy.id,
      subscriptionId: subscriptions[0]!.id,
      wave: 1,
      channel: 'push',
    },
  });
  await job.tick(at(10));
  assert.equal(await stateOf(vacancy.id), 'expirada');
  assert.equal(
    (await prisma.alert.findUniqueOrThrow({ where: { id: pending.id } }))
      .result,
    'cancelado',
  );
});

// S4 - preço cai pelos degraus --------------------------------------------------

const PRICE_NOW = new Date(SAT_10H.getTime() - 30 * HOUR);
const knee = (extra: VacancyOptions = {}) =>
  createVacancy({
    steps: true,
    fullPriceCents: 72000,
    floorPriceCents: 50000,
    priceCents: 72000,
    startsAt: SAT_10H,
    ...extra,
  });
const eventsFor = (id: string, from: number) =>
  prices.slice(from).filter((p) => p.vagaId === id);

test('C19 - preço cai para 64800 a 30 h e o socket avisa', async (t) => {
  const { vacancy } = await knee();
  const recalc = t.mock.method(pricing, 'recalculatePrices');
  const start = prices.length;
  await job.tick(PRICE_NOW);
  assert.equal(
    (await prisma.vacancy.findUniqueOrThrow({ where: { id: vacancy.id } }))
      .currentPriceCents,
    64800,
  );
  assert.deepEqual(eventsFor(vacancy.id, start), [
    { vagaId: vacancy.id, precoCentavos: 64800 },
  ]);
  assert.equal(recalc.mock.callCount(), 1);
  assert.equal(
    (recalc.mock.calls[0]?.arguments[0] as Date).getTime(),
    PRICE_NOW.getTime(),
  );
});

test('C20 - preço igual, maior ou de vaga fechada não muda nem emite', async () => {
  const dropped = await knee();
  await job.tick(PRICE_NOW);
  const lower = await knee({ priceCents: 50000 });
  const reserved = await knee({ state: 'reservada' });
  const start = prices.length;
  await job.tick(PRICE_NOW);
  const priceOf = async (id: string) =>
    (await prisma.vacancy.findUniqueOrThrow({ where: { id } }))
      .currentPriceCents;
  assert.equal(await priceOf(dropped.vacancy.id), 64800);
  assert.equal(await priceOf(lower.vacancy.id), 50000);
  assert.equal(await priceOf(reserved.vacancy.id), 72000);
  for (const v of [dropped, lower, reserved]) {
    assert.deepEqual(eventsFor(v.vacancy.id, start), []);
  }
});

test('C21 - onda do mesmo tick leva o preço novo', async () => {
  const { clinic, exam, vacancy } = await knee();
  await subscribe(clinic, exam, 5, { maxPriceCents: 70000 });
  const sent = await sendsDuring(vacancy.id, () => job.tick(PRICE_NOW));
  assert.equal(sent.length, 5);
  for (const send of sent) assert.equal(send.message.priceCents, 64800);
});

// S5 - tempo da demo (ClockService do HACK-30) ----------------------------------

test('C24 - avançar 25 h expira a vencida e baixa o preço das outras', async () => {
  await clock.reset();
  try {
    const realNow = Date.now();
    const a = await knee({ startsAt: new Date(realNow + 24 * HOUR) });
    const b = await knee({ startsAt: new Date(realNow + 48 * HOUR) });
    await clock.advance(25 * 60);
    const now = clock.now();
    const start = prices.length;
    await job.tick(now);
    assert.equal(await stateOf(a.vacancy.id), 'expirada');
    const expected = currentPriceCents({
      fullPriceCents: 72000,
      floorPriceCents: 50000,
      steps: KNEE_STEPS,
      minutesUntilStart: (realNow + 48 * HOUR - now.getTime()) / MINUTE,
    });
    assert.ok(expected < 72000);
    assert.equal(
      (await prisma.vacancy.findUniqueOrThrow({ where: { id: b.vacancy.id } }))
        .currentPriceCents,
      expected,
    );
    assert.deepEqual(eventsFor(b.vacancy.id, start), [
      { vagaId: b.vacancy.id, precoCentavos: expected },
    ]);
  } finally {
    await clock.reset();
  }
});

test('C25 - o cron lê o agora do relógio da demo', async (t) => {
  await clock.reset();
  try {
    await prisma.demoClock.upsert({
      where: { id: 1 },
      create: { id: 1, offsetMinutes: 120 },
      update: { offsetMinutes: 120 },
    });
    const tick = t.mock.method(job, 'tick', async () => undefined);
    await job.onCron();
    assert.equal(tick.mock.callCount(), 1);
    const passed = (tick.mock.calls[0]?.arguments[0] as Date).getTime();
    assert.ok(
      Math.abs(passed - (Date.now() + 120 * MINUTE)) <= 1000,
      `now passado ao tick a ${(passed - Date.now()) / MINUTE} min do relógio real`,
    );
  } finally {
    await clock.reset();
  }
});

test('C26 - avançar 10 min dispara a onda 2 com occurredAt 10 min depois', async () => {
  await clock.reset();
  try {
    const noon = new Date(
      localDayStart(new Date(Date.now() + 3 * 24 * HOUR)).getTime() + 12 * HOUR,
    );
    const { clinic, exam, vacancy } = await createVacancy({ startsAt: noon });
    await subscribe(clinic, exam, 10, { windows: ALL_DAY });
    await job.tick(clock.now());
    await clock.advance(10);
    const sent = await sendsDuring(vacancy.id, () => job.tick(clock.now()));
    assert.equal(sent.length, 5);
    assert.ok(sent.every((s) => s.context.wave === 2));
    const rows = await waveTransitions(vacancy.id);
    assert.equal(rows.length, 2);
    assert.ok(
      rows[1]!.occurredAt.getTime() - rows[0]!.occurredAt.getTime() >=
        10 * MINUTE,
    );
  } finally {
    await clock.reset();
  }
});

// S6 - tempo real a quem foi alertado --------------------------------------------

test('C27 - vagaPublicada recebe User.id dos pacientes da onda', async () => {
  const { vacancy, subscriptions } = await scenario(5);
  const patients = await prisma.patient.findMany({
    where: { id: { in: subscriptions.map((s) => s.patientId) } },
  });
  for (const p of patients) assert.notEqual(p.id, p.userId);
  const start = published.length;
  await job.tick(T0);
  const calls = published.slice(start).filter((p) => p.vagaId === vacancy.id);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    new Set(calls[0]!.userIds),
    new Set(patients.map((p) => p.userId)),
  );
  const patientIds = new Set(patients.map((p) => p.id));
  assert.ok(calls[0]!.userIds.every((id) => !patientIds.has(id)));
});

test('C28 - falha do socket não desfaz a onda', async (t) => {
  const { vacancy } = await scenario(5);
  publishedHook = () => {
    throw new Error('socket forçado a falhar');
  };
  const logs = captureLogs(t);
  await assert.doesNotReject(job.tick(T0));
  assert.equal((await waveTransitions(vacancy.id)).length, 1);
  assert.equal((await alertedSubscriptions(vacancy.id)).size, 5);
  assert.equal(
    logs.filter(
      (l) =>
        (l.level === 'warn' || l.level === 'error') &&
        l.text.includes(vacancy.id),
    ).length,
    1,
  );
});

// S7 - pendentes de vaga em estado final---------------------------------------------

// C30 mudado na continuação, 08/11: reservada não cancela (pode voltar por T9/T11).
test('C30 - tick cancela pendentes de vaga em estado final', async () => {
  const states = [
    'reservada',
    'realizada',
    'expirada',
    'cancelada',
    'publicada',
    'alertando',
  ] as const;
  const seeded: { state: string; ids: Record<string, string> }[] = [];
  for (const state of states) {
    const { vacancy, subscriptions } = await scenario(1, {
      state,
      startsAt: new Date(SAT_10H.getTime() + 2 * HOUR),
    });
    const ids: Record<string, string> = {};
    for (const [channel, result] of [
      ['push', 'pendente'],
      ['email', 'enviado'],
      ['whatsapp', 'falhou'],
    ] as const) {
      const alert = await prisma.alert.create({
        data: {
          vacancyId: vacancy.id,
          subscriptionId: subscriptions[0]!.id,
          wave: 1,
          channel,
          result,
        },
      });
      ids[result] = alert.id;
    }
    seeded.push({ state, ids });
  }
  await job.tick(T0);
  const closed = new Set(['realizada', 'expirada', 'cancelada']);
  for (const { state, ids } of seeded) {
    for (const [original, id] of Object.entries(ids)) {
      const { result } = await prisma.alert.findUniqueOrThrow({
        where: { id },
      });
      const expected =
        original === 'pendente' && closed.has(state) ? 'cancelado' : original;
      assert.equal(result, expected, `${state}/${original}`);
    }
  }
});

// S8 - job registrado e sem sobreposição ----------------------------------------

test('C31 - cron vacancy-motor registrado a cada minuto e sem o exemplo', () => {
  assert.ok(app.get(VacancyMotorJob) instanceof VacancyMotorJob);
  assert.ok(app.get(WavesService) instanceof WavesService);
  const registry = app.get(SchedulerRegistry);
  assert.equal(
    registry.getCronJob(VACANCY_MOTOR_JOB).cronTime.source,
    '0 * * * * *',
  );
  assert.equal(VACANCY_MOTOR_JOB, 'vacancy-motor');
  assert.ok(!registry.getCronJobs().has('example-heartbeat'));
  // O fonte, não o .test-dist: o tsc não apaga compilações antigas.
  assert.equal(
    existsSync(join(__dirname, '..', '..', '..', 'src', 'examples')),
    false,
  );
});

test('C32 - disparo sobreposto é pulado com warn', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let first = true;
  const dispatch = t.mock.method(waves, 'dispatchDue', async () => {
    if (first) {
      first = false;
      await gate;
    }
  });
  const logs = captureLogs(t);
  const running = job.onCron();
  while (dispatch.mock.callCount() === 0) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await job.onCron();
  assert.equal(dispatch.mock.callCount(), 1);
  assert.equal(
    logs.filter((l) => l.level === 'warn' && l.text.includes(VACANCY_MOTOR_JOB))
      .length,
    1,
  );
  release();
  await running;
  await job.onCron();
  assert.equal(dispatch.mock.callCount(), 2);
});

test('C33 - tick sem falha não registra linha por vaga', async (t) => {
  await scenario(5);
  await scenario(5);
  await knee();
  const logs = captureLogs(t);
  await job.tick(PRICE_NOW);
  assert.deepEqual(
    logs.filter(
      (l) => l.context === 'VacancyMotorJob' || l.context === 'WavesService',
    ),
    [],
  );
});
