import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import {
  type INestApplication,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createApp } from '../../app';
import type { Exam } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createSchemaFixtures, examData } from '../../testing/schema-fixtures';
import { ClockService } from '../clock/clock.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PricingService } from './pricing.service';
import { VacanciesService } from './vacancies.service';

/**
 * Motor de preço contra o Postgres (HACK-30), pela aplicação montada. Cada teste usa
 * uma clínica e um exame próprios: o recálculo é global, então as asserções olham
 * só para as vagas criadas aqui.
 */

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

let app: INestApplication;
let prisma: PrismaService;
let pricing: PricingService;
let vacancies: VacanciesService;
let fixtures: ReturnType<typeof createSchemaFixtures>;
let tussSeq = 0;
const emitted: { vagaId: string; precoCentavos: number }[] = [];

before(async () => {
  app = await createApp({ logger: false });
  prisma = app.get(PrismaService);
  pricing = app.get(PricingService);
  vacancies = app.get(VacanciesService);
  fixtures = createSchemaFixtures(prisma);
  mock.method(
    app.get(RealtimeService),
    'vagaPreco',
    (input: (typeof emitted)[number]) => {
      emitted.push(input);
    },
  );
});

after(async () => {
  const own = { clinic: { userId: { in: fixtures.userIds } } };
  await prisma.transition.deleteMany({ where: { vacancy: { slot: own } } });
  await prisma.vacancy.deleteMany({ where: { slot: own } });
  await prisma.slot.deleteMany({ where: own });
  await prisma.exam.deleteMany({ where: own });
  await prisma.clinic.deleteMany({
    where: { userId: { in: fixtures.userIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: fixtures.userIds } } });
  await app.close();
});

/** RM de joelho da spec (F8): R$ 720, piso R$ 500, degraus -10%/48h, -20%/24h, -30%/6h. */
async function kneeMri(floorPriceCents = 50000): Promise<Exam> {
  const clinic = await fixtures.createClinic();
  return prisma.exam.create({
    data: {
      ...examData(clinic.id, {
        tussCode: `8${String(++tussSeq).padStart(7, '0')}`,
        fullPriceCents: 72000,
        floorPriceCents,
      }),
      priceSteps: {
        create: [
          { leadMinutes: 48 * 60, discountPercent: 10 },
          { leadMinutes: 24 * 60, discountPercent: 20 },
          { leadMinutes: 6 * 60, discountPercent: 30 },
        ],
      },
    },
  });
}

async function publishAt(exam: Exam, startsAt: Date, now: Date) {
  const slot = await prisma.slot.create({
    data: {
      clinicId: exam.clinicId,
      examId: exam.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * MINUTE),
      origin: 'manual',
    },
  });
  const currentPriceCents = await pricing.initialPriceCents(slot.id, now);
  return vacancies.publish(
    { slotId: slot.id, origin: 'vazio', currentPriceCents },
    { origin: 'clinica', reason: 'teste do motor de preço' },
  );
}

const priceOf = async (id: string) =>
  (await prisma.vacancy.findUniqueOrThrow({ where: { id } })).currentPriceCents;

test('vaga nasce com o preço do degrau atual: faltam 30 h → R$ 648', async () => {
  const now = new Date();
  const vacancy = await publishAt(
    await kneeMri(),
    new Date(now.getTime() + 30 * HOUR),
    now,
  );
  assert.equal(vacancy.currentPriceCents, 64800);
});

test('recálculo desce o preço com o tempo, avisa em tempo real e para no piso', async () => {
  const now = new Date();
  const startsAt = new Date(now.getTime() + 50 * HOUR);
  const vacancy = await publishAt(await kneeMri(), startsAt, now);
  assert.equal(vacancy.currentPriceCents, 72000);

  const at = (hoursLeft: number) =>
    new Date(startsAt.getTime() - hoursLeft * HOUR);
  const own = (changes: { vacancyId: string }[]) =>
    changes.filter((c) => c.vacancyId === vacancy.id);

  assert.deepEqual(own(await pricing.recalculatePrices(at(30))), [
    { vacancyId: vacancy.id, priceCents: 64800 },
  ]);
  assert.equal(await priceOf(vacancy.id), 64800);
  assert.deepEqual(own(await pricing.recalculatePrices(at(20))), [
    { vacancyId: vacancy.id, priceCents: 57600 },
  ]);
  assert.deepEqual(own(await pricing.recalculatePrices(at(5))), [
    { vacancyId: vacancy.id, priceCents: 50400 },
  ]);
  assert.deepEqual(
    emitted.filter((e) => e.vagaId === vacancy.id).map((e) => e.precoCentavos),
    [64800, 57600, 50400],
  );
});

test('rodar duas vezes no mesmo instante não muda nem avisa de novo', async () => {
  const now = new Date();
  const startsAt = new Date(now.getTime() + 50 * HOUR);
  const vacancy = await publishAt(await kneeMri(), startsAt, now);
  const at20h = new Date(startsAt.getTime() - 20 * HOUR);
  await pricing.recalculatePrices(at20h);
  const before = emitted.length;
  const again = await pricing.recalculatePrices(at20h);
  assert.equal(again.filter((c) => c.vacancyId === vacancy.id).length, 0);
  assert.equal(emitted.filter((e) => e.vagaId === vacancy.id).length, 1);
  assert.ok(emitted.length >= before);
});

test('o preço nunca sobe, mesmo se o relógio voltar', async () => {
  const now = new Date();
  const startsAt = new Date(now.getTime() + 50 * HOUR);
  const vacancy = await publishAt(await kneeMri(), startsAt, now);
  await pricing.recalculatePrices(new Date(startsAt.getTime() - 5 * HOUR));
  await pricing.recalculatePrices(new Date(startsAt.getTime() - 40 * HOUR));
  assert.equal(await priceOf(vacancy.id), 50400);
});

test('piso R$ 600 com 5 h restantes → R$ 600', async () => {
  const now = new Date();
  const startsAt = new Date(now.getTime() + 50 * HOUR);
  const vacancy = await publishAt(await kneeMri(60000), startsAt, now);
  await pricing.recalculatePrices(new Date(startsAt.getTime() - 5 * HOUR));
  assert.equal(await priceOf(vacancy.id), 60000);
});

test('vaga fora de venda não é recalculada', async () => {
  const now = new Date();
  const startsAt = new Date(now.getTime() + 50 * HOUR);
  const vacancy = await publishAt(await kneeMri(), startsAt, now);
  await vacancies.transition(vacancy.id, 'cancelada', {
    origin: 'clinica',
    reason: 'teste',
  });
  await pricing.recalculatePrices(new Date(startsAt.getTime() - 5 * HOUR));
  assert.equal(await priceOf(vacancy.id), 72000);
});

test('avançar o relógio da demo em 25 h muda o preço no próximo ciclo', async () => {
  const clock = app.get(ClockService);
  await clock.reset();
  try {
    const now = clock.now();
    const vacancy = await publishAt(
      await kneeMri(),
      new Date(now.getTime() + 30 * HOUR),
      now,
    );
    assert.equal(vacancy.currentPriceCents, 64800);
    await clock.advance(25 * 60);
    await pricing.recalculatePrices(clock.now());
    assert.equal(await priceOf(vacancy.id), 50400);
  } finally {
    await clock.reset();
  }
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Publica pelo caminho com teto; `holdMs` segura a transação antes de gravar. */
async function publishCapped(exam: Exam, hoursAhead: number, holdMs = 0) {
  const now = new Date();
  const startsAt = new Date(now.getTime() + hoursAhead * HOUR);
  const slot = await prisma.slot.create({
    data: {
      clinicId: exam.clinicId,
      examId: exam.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * MINUTE),
      origin: 'manual',
    },
  });
  const currentPriceCents = await pricing.initialPriceCents(slot.id, now);
  return pricing.publishWithinDailyCap(exam.clinicId, async (tx) => {
    if (holdMs > 0) await sleep(holdMs);
    return vacancies.publish(
      { slotId: slot.id, origin: 'vazio', currentPriceCents },
      { origin: 'clinica', reason: 'teste do teto diário' },
      tx,
    );
  });
}

function isCapError(error: unknown, cap: number): boolean {
  assert.ok(error instanceof UnprocessableEntityException, String(error));
  assert.equal(error.getStatus(), 422);
  const body = error.getResponse() as { code: string; cap: number };
  assert.equal(body.code, 'DAILY_DISCOUNT_CAP');
  assert.equal(body.cap, cap);
  return true;
}

const vacanciesOf = (exam: Exam) =>
  prisma.vacancy.count({ where: { slot: { examId: exam.id } } });

test('teto diário (RN-28): a sexta vaga do dia é recusada com 422 e o teto', async () => {
  const exam = await kneeMri();
  for (let i = 0; i < 5; i++) await publishCapped(exam, 30 + i);
  await assert.rejects(publishCapped(exam, 40), (e) => isCapError(e, 5));
  assert.equal(await vacanciesOf(exam), 5);
});

test('HACK-47: duas publicações simultâneas com teto - 1 → só uma passa', async () => {
  const exam = await kneeMri();
  for (let i = 0; i < 4; i++) await publishCapped(exam, 30 + i);
  const results = await Promise.allSettled([
    publishCapped(exam, 40, 300),
    publishCapped(exam, 41, 300),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(isCapError(rejected[0]?.reason, 5));
  assert.equal(await vacanciesOf(exam), 5);
});

test('recusa pelo teto não grava vaga nem transição', async () => {
  const exam = await kneeMri();
  await prisma.clinic.update({
    where: { id: exam.clinicId },
    data: { dailyDiscountCap: 0 },
  });
  await assert.rejects(publishCapped(exam, 30), (e) => isCapError(e, 0));
  assert.equal(await vacanciesOf(exam), 0);
});

test('teto diário conta só o dia local: vagas de ontem não contam', async () => {
  const exam = await kneeMri();
  await prisma.clinic.update({
    where: { id: exam.clinicId },
    data: { dailyDiscountCap: 1 },
  });
  const vacancy = await publishCapped(exam, 30);
  await prisma.vacancy.update({
    where: { id: vacancy.id },
    data: { createdAt: new Date(Date.now() - 36 * HOUR) },
  });
  await publishCapped(exam, 31);
  assert.equal(await vacanciesOf(exam), 2);
});
