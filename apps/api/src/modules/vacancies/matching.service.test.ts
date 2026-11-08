import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../app';
import type {
  AlertResult,
  Clinic,
  Exam,
  Subscription,
  Vacancy,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createSchemaFixtures, examData } from '../../testing/schema-fixtures';
import {
  NotificationsService,
  STALE_PENDING_MS,
} from '../notifications/notifications.service';
import { MatchingService } from './matching.service';

/**
 * Matching contra o Postgres (HACK-31, HACK-43 a HACK-45): o raio é filtrado pelo
 * haversine em SQL e os alertas pelo filtro `none` do Prisma. Cada bloco usa um TUSS
 * próprio, então as consultas não enxergam dados de outros arquivos de teste.
 */

const KM_LAT = 1 / 111.195; // graus de latitude por quilômetro
// Sábado 16/01/2027, 10h em São Paulo (UTC-3), longe o bastante para o preparo.
const SATURDAY_10H = new Date('2027-01-16T13:00:00Z');
const now = new Date('2027-01-10T12:00:00Z');
const SAT_MORNING = { weekday: 6, startMinute: 9 * 60, endMinute: 12 * 60 };

let app: INestApplication;
let prisma: PrismaService;
let matching: MatchingService;
let fixtures: ReturnType<typeof createSchemaFixtures>;
let clinic: Clinic;
let tussSeq = 0;

before(async () => {
  app = await createApp({ logger: false });
  prisma = app.get(PrismaService);
  matching = app.get(MatchingService);
  fixtures = createSchemaFixtures(prisma);
  clinic = await fixtures.createClinic();
});

after(async () => {
  const ownClinic = { clinic: { userId: { in: fixtures.userIds } } };
  const ownPatient = { patient: { userId: { in: fixtures.userIds } } };
  await prisma.alert.deleteMany({ where: { subscription: ownPatient } });
  await prisma.subscription.deleteMany({ where: ownPatient });
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

async function createExam(): Promise<Exam> {
  return prisma.exam.create({
    data: examData(clinic.id, {
      tussCode: `7${String(++tussSeq).padStart(7, '0')}`,
    }),
  });
}

async function createVacancy(
  exam: Exam,
  options: { state?: 'publicada' | 'cancelada'; minutes?: number } = {},
): Promise<Vacancy> {
  const slot = await prisma.slot.create({
    data: {
      clinicId: clinic.id,
      examId: exam.id,
      startsAt: SATURDAY_10H,
      endsAt: new Date(
        SATURDAY_10H.getTime() + (options.minutes ?? 30) * 60_000,
      ),
      origin: 'manual',
    },
  });
  return prisma.vacancy.create({
    data: {
      slotId: slot.id,
      origin: 'vazio',
      state: options.state ?? 'publicada',
      currentPriceCents: 25000,
    },
  });
}

async function subscribe(
  exam: Exam,
  options: {
    kmNorth?: number;
    radiusMeters?: number;
    window?: typeof SAT_MORNING;
  } = {},
): Promise<Subscription> {
  const patient = await fixtures.createPatient();
  return prisma.subscription.create({
    data: {
      patientId: patient.id,
      tussCode: exam.tussCode,
      maxPriceCents: 30000,
      latitude: clinic.latitude + (options.kmNorth ?? 0) * KM_LAT,
      longitude: clinic.longitude,
      radiusMeters: options.radiusMeters ?? 10_000,
      expiresAt: new Date('2027-12-31T00:00:00Z'),
      windows: { create: [options.window ?? SAT_MORNING] },
    },
  });
}

async function alert(
  vacancy: Vacancy,
  subscription: Subscription,
  result: AlertResult,
  ageMs = 0,
) {
  await prisma.alert.create({
    data: {
      vacancyId: vacancy.id,
      subscriptionId: subscription.id,
      wave: 1,
      channel: 'push',
      result,
      createdAt: new Date(Date.now() - ageMs),
    },
  });
}

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe('candidatos · critérios do card (HACK-31)', () => {
  test('vaga a 12 km com raio de 10 km não é candidata; com 13 km é', async () => {
    const exam = await createExam();
    const vacancy = await createVacancy(exam);
    const tooFar = await subscribe(exam, { kmNorth: 12 });
    const wide = await subscribe(exam, { kmNorth: 12, radiusMeters: 13_000 });
    const result = ids(await matching.candidatos(vacancy.id, now));
    assert.equal(result.includes(tooFar.id), false);
    assert.equal(result.includes(wide.id), true);
  });

  test('vaga sáb 10h com janela sáb 14h-18h não é candidata', async () => {
    const exam = await createExam();
    const vacancy = await createVacancy(exam);
    await subscribe(exam, {
      window: { weekday: 6, startMinute: 14 * 60, endMinute: 18 * 60 },
    });
    const morning = await subscribe(exam);
    assert.deepEqual(ids(await matching.candidatos(vacancy.id, now)), [
      morning.id,
    ]);
  });

  test('horário que termina depois da janela não é candidato (HACK-43)', async () => {
    const exam = await createExam();
    // 10h às 12h30, janela até 12h.
    const vacancy = await createVacancy(exam, { minutes: 150 });
    await subscribe(exam);
    assert.deepEqual(await matching.candidatos(vacancy.id, now), []);
  });

  test('ordem de inscrição, da mais antiga para a mais nova', async () => {
    const exam = await createExam();
    const vacancy = await createVacancy(exam);
    const first = await subscribe(exam);
    const second = await subscribe(exam);
    const third = await subscribe(exam);
    assert.deepEqual(ids(await matching.candidatos(vacancy.id, now)), [
      first.id,
      second.id,
      third.id,
    ]);
  });
});

describe('candidatos · alertas já enviados (HACK-44, HACK-45)', () => {
  test('12 candidatos, 5 alertados: os próximos são do 6º ao 12º', async () => {
    const exam = await createExam();
    const vacancy = await createVacancy(exam);
    const queue: Subscription[] = [];
    for (let i = 0; i < 12; i++) queue.push(await subscribe(exam));
    for (const subscription of queue.slice(0, 5)) {
      await alert(vacancy, subscription, 'enviado');
    }
    assert.deepEqual(
      ids(await matching.candidatos(vacancy.id, now)),
      ids(queue.slice(5)),
    );
  });

  test('pendente abandonado (11 s) volta; pendente recente e falhado ficam fora', async () => {
    const exam = await createExam();
    const vacancy = await createVacancy(exam);
    const stale = await subscribe(exam);
    const recent = await subscribe(exam);
    const failed = await subscribe(exam);
    await alert(vacancy, stale, 'pendente', STALE_PENDING_MS + 1_000);
    await alert(vacancy, recent, 'pendente', 1_000);
    await alert(vacancy, failed, 'falhou', STALE_PENDING_MS * 10);
    assert.deepEqual(ids(await matching.candidatos(vacancy.id, now)), [
      stale.id,
    ]);
  });
});

describe('vagasCompativeis (RN-19)', () => {
  test('inscrição nova com vaga compatível existente → devolve a vaga', async () => {
    const exam = await createExam();
    const vacancy = await createVacancy(exam);
    const subscription = await subscribe(exam);
    assert.deepEqual(
      ids(await matching.vagasCompativeis(subscription.id, now)),
      [vacancy.id],
    );
  });

  test('vaga fora do raio ou cancelada não volta', async () => {
    const exam = await createExam();
    await createVacancy(exam, { state: 'cancelada' });
    const open = await createVacancy(exam);
    const near = await subscribe(exam);
    const far = await subscribe(exam, { kmNorth: 12 });
    assert.deepEqual(ids(await matching.vagasCompativeis(near.id, now)), [
      open.id,
    ]);
    assert.deepEqual(await matching.vagasCompativeis(far.id, now), []);
  });
});

describe('fila sem canal disponível (HACK-48)', () => {
  const message = {
    clinicName: 'Clínica Teste',
    examName: 'Exame',
    startsAt: SATURDAY_10H,
    priceCents: 25000,
    distanceMeters: 0,
    preparation: null,
    vacancyUrl: 'https://app.example/vagas/x',
  };

  test('sem adapters, onda 1 com 5 candidatos → a onda 2 devolve os seguintes', async () => {
    // A app de teste não tem RESEND_API_KEY nem WhatsApp: nenhum adapter.
    const notifications = app.get(NotificationsService);
    const exam = await createExam();
    const vacancy = await createVacancy(exam);
    const queue: Subscription[] = [];
    for (let i = 0; i < 12; i++) queue.push(await subscribe(exam));

    const wave1 = (await matching.candidatos(vacancy.id, now)).slice(0, 5);
    assert.deepEqual(ids(wave1), ids(queue.slice(0, 5)));
    for (const subscription of wave1) {
      const outcome = await notifications.enviar(
        subscription.patientId,
        message,
        { vacancyId: vacancy.id, subscriptionId: subscription.id, wave: 1 },
      );
      assert.ok(outcome.every((o) => o.result === 'sem_canal'));
    }

    const wave2 = (await matching.candidatos(vacancy.id, now)).slice(0, 5);
    assert.deepEqual(ids(wave2), ids(queue.slice(5, 10)));
  });

  test('paciente que desativou todos os canais fica fora da onda', async () => {
    const exam = await createExam();
    const vacancy = await createVacancy(exam);
    const silent = await subscribe(exam);
    await prisma.patient.update({
      where: { id: silent.patientId },
      data: { alertChannels: [] },
    });
    const reachable = await subscribe(exam);
    assert.deepEqual(ids(await matching.candidatos(vacancy.id, now)), [
      reachable.id,
    ]);
  });
});
