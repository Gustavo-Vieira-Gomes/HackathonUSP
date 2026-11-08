import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, mock, test } from 'node:test';
import {
  ConflictException,
  type INestApplication,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createApp } from '../../app';
import {
  type Exam,
  type Prisma,
  type TransitionOrigin,
  VacancyState,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createSchemaFixtures, examData } from '../../testing/schema-fixtures';
import { ClockService } from '../clock/clock.service';
import { VacanciesService } from './vacancies.service';

/**
 * Prova a máquina de estados da vaga (checks.md do HACK-29) contra o Postgres do
 * worktree, pela aplicação montada por `createApp`. Cada teste começa pelo id do
 * check. As fixtures seguem as regras da Fundação mesmo onde o banco ainda não as
 * cobra: horário e exame da mesma clínica, `Reservation.slotId` = horário da vaga, e
 * a limpeza apaga filho → pai porque as FKs da fatia 2 são Restrict.
 */

// Lista literal da «Tabela de transições» do plano (T2 a T12; T1 é o publish).
const ACCEPTED = new Set([
  'publicada>alertando',
  'alertando>alertando',
  'alertando>publicada',
  'publicada>reservada',
  'alertando>reservada',
  'reservada>realizada',
  'publicada>expirada',
  'alertando>expirada',
  'reservada>publicada',
  'reservada>cancelada',
  'reservada>alertando',
  'publicada>cancelada',
  'alertando>cancelada',
]);
const STATES = Object.values(VacancyState);
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

let app: INestApplication;
let prisma: PrismaService;
let service: VacanciesService;
let fixtures: ReturnType<typeof createSchemaFixtures>;
let exam: Exam;
let tussSeq = 0;

const meta = (
  origin: TransitionOrigin = 'motor',
  reason = 'motivo de teste',
) => ({
  origin,
  reason,
});

before(async () => {
  app = await createApp({ logger: false });
  prisma = app.get(PrismaService);
  service = app.get(VacanciesService);
  fixtures = createSchemaFixtures(prisma);
  exam = await createExam();
});

async function createExam() {
  const clinic = await fixtures.createClinic();
  return prisma.exam.create({
    data: examData(clinic.id, {
      tussCode: `9${String(++tussSeq).padStart(7, '0')}`,
    }),
  });
}

/** Horário sempre na clínica do exame. */
async function createSlot(startsAt: Date) {
  return prisma.slot.create({
    data: {
      clinicId: exam.clinicId,
      examId: exam.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * MINUTE),
      origin: 'agenda',
    },
  });
}

/** Vaga gravada direto no estado pedido (fixture, não passa pelo serviço). */
async function createVacancy(
  state: VacancyState,
  startsAt = new Date(Date.now() - 24 * HOUR),
) {
  const slot = await createSlot(startsAt);
  return prisma.vacancy.create({
    data: { slotId: slot.id, origin: 'vazio', state, currentPriceCents: 20000 },
  });
}

async function publishVacancy(startsAt = new Date(Date.now() + 24 * HOUR)) {
  const slot = await createSlot(startsAt);
  return service.publish(
    { slotId: slot.id, origin: 'vazio', currentPriceCents: 20000 },
    meta('clinica', 'publicação de teste'),
  );
}

async function snapshot(vacancyId: string) {
  const vacancy = await prisma.vacancy.findUniqueOrThrow({
    where: { id: vacancyId },
  });
  const transitions = await prisma.transition.count({ where: { vacancyId } });
  return { state: vacancy.state, transitions };
}

async function assertConflict(promise: Promise<unknown>, message?: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ConflictException, String(error));
    assert.equal(error.getStatus(), 409);
    if (message !== undefined) assert.equal(error.message, message);
    return true;
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Era própria de cada teste de expiração, muito antes de qualquer outro dado. */
const era = (k: number) => new Date(Date.UTC(1980 + k, 0, 1, 12));

async function cleanup() {
  const ownSlot = { slot: { clinic: { userId: { in: fixtures.userIds } } } };
  await prisma.transition.deleteMany({
    where: { OR: [{ vacancy: ownSlot }, { reservation: ownSlot }] },
  });
  await prisma.reservation.deleteMany({ where: ownSlot });
  await prisma.vacancy.deleteMany({ where: ownSlot });
  await prisma.slot.deleteMany({
    where: { clinic: { userId: { in: fixtures.userIds } } },
  });
  await prisma.exam.deleteMany({
    where: { clinic: { userId: { in: fixtures.userIds } } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: fixtures.suffix } },
  });
}

after(async () => {
  if (fixtures) await cleanup();
  await app?.close();
});

// S1 - tabela e recusa

test('C1 - publicada para realizada recusa com 409', async () => {
  const vacancy = await createVacancy('publicada');
  await assertConflict(
    service.transition(vacancy.id, 'realizada', meta('clinica')),
    'Transição de vaga inválida: publicada → realizada',
  );
});

test('C2 - recusa não muda estado nem grava transição', async () => {
  const vacancy = await publishVacancy();
  const before = await snapshot(vacancy.id);
  assert.deepEqual(before, { state: 'publicada', transitions: 1 });
  await assertConflict(
    service.transition(vacancy.id, 'realizada', meta('clinica')),
  );
  assert.deepEqual(await snapshot(vacancy.id), before);
});

test('C4 - serviço segue a tabela nos 36 pares', async () => {
  let accepted = 0;
  let refused = 0;
  for (const from of STATES) {
    for (const to of STATES) {
      const vacancy = await createVacancy(from);
      const label = `${from} → ${to}`;
      if (ACCEPTED.has(`${from}>${to}`)) {
        const result = await service.transition(vacancy.id, to, meta());
        assert.equal(result.state, to, label);
        assert.deepEqual(
          await snapshot(vacancy.id),
          { state: to, transitions: 1 },
          label,
        );
        accepted += 1;
      } else {
        await assertConflict(service.transition(vacancy.id, to, meta()));
        assert.deepEqual(
          await snapshot(vacancy.id),
          { state: from, transitions: 0 },
          label,
        );
        refused += 1;
      }
    }
  }
  assert.equal(accepted, 13);
  assert.equal(refused, 23);
});

test('C5 - estados terminais recusam qualquer destino', async () => {
  let refused = 0;
  for (const from of ['realizada', 'expirada', 'cancelada'] as const) {
    for (const to of STATES) {
      const vacancy = await createVacancy(from);
      await assertConflict(service.transition(vacancy.id, to, meta()));
      assert.deepEqual(await snapshot(vacancy.id), {
        state: from,
        transitions: 0,
      });
      refused += 1;
    }
  }
  assert.equal(refused, 18);
});

test('C6 - vaga inexistente recusa com 404', async () => {
  const id = randomUUID();
  await assert.rejects(
    service.transition(id, 'alertando', meta()),
    (error: unknown) => {
      assert.ok(error instanceof NotFoundException, String(error));
      assert.equal(error.getStatus(), 404);
      assert.equal(error.message, 'Vaga não encontrada');
      return true;
    },
  );
  assert.equal(await prisma.transition.count({ where: { vacancyId: id } }), 0);
});

test('C7 - motivo vazio, só espaços ou acima de 500 é recusado', async () => {
  const vacancy = await publishVacancy();
  const before = await snapshot(vacancy.id);
  for (const reason of ['', '   ', 'x'.repeat(501)]) {
    await assert.rejects(
      service.transition(vacancy.id, 'alertando', meta('motor', reason)),
    );
    assert.deepEqual(
      await snapshot(vacancy.id),
      before,
      `reason ${reason.length}`,
    );

    const slot = await createSlot(new Date(Date.now() + 48 * HOUR));
    await assert.rejects(
      service.publish(
        { slotId: slot.id, origin: 'vazio', currentPriceCents: 20000 },
        meta('clinica', reason),
      ),
    );
    assert.equal(await prisma.vacancy.count({ where: { slotId: slot.id } }), 0);
  }

  const limit = 'x'.repeat(500);
  const result = await service.transition(
    vacancy.id,
    'alertando',
    meta('motor', limit),
  );
  assert.equal(result.state, 'alertando');
  const last = await prisma.transition.findFirstOrThrow({
    where: { vacancyId: vacancy.id, toState: 'alertando' },
  });
  assert.equal(last.reason, limit);
});

test('C8 - app monta o VacanciesService', () => {
  assert.ok(app.get(VacanciesService) instanceof VacanciesService);
});

// S2 - log na mesma transação

test('C9 - publish grava publicada e a primeira transição', async () => {
  const slot = await createSlot(new Date(Date.now() + 24 * HOUR));
  const vacancy = await service.publish(
    { slotId: slot.id, origin: 'vazio', currentPriceCents: 20000 },
    { origin: 'clinica', reason: 'r' },
  );
  assert.equal(vacancy.state, 'publicada');
  const stored = await prisma.vacancy.findUniqueOrThrow({
    where: { id: vacancy.id },
  });
  assert.equal(stored.state, 'publicada');
  const transitions = await prisma.transition.findMany({
    where: { vacancyId: vacancy.id },
  });
  assert.equal(transitions.length, 1);
  const [first] = transitions;
  assert.ok(first);
  assert.equal(first.vacancyId, vacancy.id);
  assert.equal(first.reservationId, null);
  assert.equal(first.fromState, null);
  assert.equal(first.toState, 'publicada');
  assert.equal(first.origin, 'clinica');
  assert.equal(first.reason, 'r');
});

test('C10 - transição aceita grava from, to, origem e motivo', async () => {
  const vacancy = await publishVacancy();
  const result = await service.transition(vacancy.id, 'alertando', {
    origin: 'motor',
    reason: 'onda 1',
  });
  assert.equal(result.id, vacancy.id);
  assert.equal(result.state, 'alertando');
  const rows = await prisma.transition.findMany({
    where: { vacancyId: vacancy.id, fromState: 'publicada' },
  });
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.ok(row);
  assert.equal(row.toState, 'alertando');
  assert.equal(row.origin, 'motor');
  assert.equal(row.reason, 'onda 1');
  assert.ok(row.occurredAt instanceof Date);
});

async function cardScenario() {
  const vacancy = await publishVacancy();
  await service.transition(vacancy.id, 'alertando', meta('motor', 'onda 1'));
  await service.transition(vacancy.id, 'alertando', meta('motor', 'onda 2'));
  await service.transition(vacancy.id, 'reservada', meta('paciente', 'aceite'));
  await service.transition(
    vacancy.id,
    'realizada',
    meta('clinica', 'exame feito'),
  );
  return service.timeline(vacancy.id);
}

test('C11 - linha do tempo do card tem 5 linhas em ordem', async () => {
  const timeline = await cardScenario();
  assert.deepEqual(
    timeline.map((row) => `${row.fromState ?? 'null'}→${row.toState}`),
    [
      'null→publicada',
      'publicada→alertando',
      'alertando→alertando',
      'alertando→reservada',
      'reservada→realizada',
    ],
  );
});

test('C12 - occurredAt estritamente crescente por vaga', async () => {
  // Relógio parado: todas as chamadas veem o mesmo milissegundo.
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  let timeline;
  try {
    assert.equal(Date.now(), Date.now());
    timeline = await cardScenario();
  } finally {
    mock.timers.reset();
  }
  assert.equal(timeline.length, 5);
  for (let i = 1; i < timeline.length; i += 1) {
    const previous = timeline[i - 1]!.occurredAt.getTime();
    const current = timeline[i]!.occurredAt.getTime();
    assert.ok(current - previous >= 1, `linha ${i}: ${previous} → ${current}`);
  }
});

type TxCallback = (tx: Prisma.TransactionClient) => Promise<unknown>;
type TransactionFn = (fn: TxCallback, options?: unknown) => Promise<unknown>;

/**
 * Troca `prisma.$transaction` pelo envoltório e devolve quantas vezes foi chamado e
 * como restaurar. O `mock.method` do node:test não acha o método no cliente Prisma.
 */
function replaceTransaction(build: (original: TransactionFn) => TransactionFn) {
  const target = prisma as unknown as { $transaction: TransactionFn };
  const original = target.$transaction.bind(prisma);
  const wrapped = build(original);
  let calls = 0;
  target.$transaction = (fn, options) => {
    calls += 1;
    return wrapped(fn, options);
  };
  return {
    calls: () => calls,
    restore: () => {
      target.$transaction = original;
    },
  };
}

/** Expõe o objeto alvo com métodos ligados a ele, trocando o que `override` define. */
function wrap<T extends object>(
  target: T,
  override: Record<string, unknown>,
): T {
  return new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === 'string' && prop in override) return override[prop];
      const value: unknown = Reflect.get(obj, prop, obj);
      return typeof value === 'function' ? value.bind(obj) : value;
    },
  });
}

test('C13 - falha ao gravar a transição desfaz o update', async () => {
  const vacancy = await publishVacancy();
  const before = await snapshot(vacancy.id);
  let updated = 0;
  const spy = replaceTransaction(
    (original) => (fn, options) =>
      original(
        (tx) =>
          fn(
            wrap(tx, {
              vacancy: wrap(tx.vacancy, {
                updateMany: async (args: Prisma.VacancyUpdateManyArgs) => {
                  const result = await tx.vacancy.updateMany(args);
                  updated += result.count;
                  return result;
                },
              }),
              transition: wrap(tx.transition, {
                create: async () => {
                  throw new Error('falha forçada ao gravar a Transition');
                },
              }),
            }),
          ),
        options,
      ),
  );
  try {
    await assert.rejects(
      service.transition(vacancy.id, 'alertando', meta()),
      /falha forçada/,
    );
  } finally {
    spy.restore();
  }
  assert.equal(spy.calls(), 1);
  assert.equal(updated, 1, 'o update real precisa ter rodado antes da falha');
  assert.deepEqual(await snapshot(vacancy.id), before);
});

test('C14 - rollback do chamador desfaz estado e transição', async () => {
  const vacancy = await publishVacancy();
  const before = await snapshot(vacancy.id);
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await service.transition(vacancy.id, 'alertando', meta(), tx);
      throw new Error('rollback do chamador');
    }),
    /rollback do chamador/,
  );
  assert.deepEqual(await snapshot(vacancy.id), before);
  assert.equal(before.state, 'publicada');
});

test('C15 - com tx do chamador a transição entra no commit dele', async () => {
  const vacancy = await publishVacancy();
  const spy = replaceTransaction((original) => original);
  try {
    await prisma.$transaction((tx) =>
      service.transition(vacancy.id, 'alertando', meta(), tx),
    );
    assert.equal(spy.calls(), 1);
  } finally {
    spy.restore();
  }
  assert.deepEqual(await snapshot(vacancy.id), {
    state: 'alertando',
    transitions: 2,
  });
});

// S3 - concorrência

test('C16 - corrida reserva × expiração: só uma vence', async () => {
  for (let round = 0; round < 20; round += 1) {
    const vacancy = await createVacancy('alertando');
    const results = await Promise.allSettled([
      service.transition(vacancy.id, 'reservada', meta('paciente')),
      service.transition(vacancy.id, 'expirada', meta('motor')),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    assert.equal(fulfilled.length, 1, `rodada ${round}`);
    assert.equal(rejected.length, 1, `rodada ${round}`);
    const [failure] = rejected;
    assert.ok(
      failure?.reason instanceof ConflictException,
      String(failure?.reason),
    );
    assert.equal(failure.reason.getStatus(), 409);
    assert.equal(
      await prisma.transition.count({ where: { vacancyId: vacancy.id } }),
      1,
      `rodada ${round}`,
    );
  }
});

// S4 - expiração

test('C17 - expireDue expira publicada e alertando vencidas', async () => {
  const now = era(1);
  await service.expireDue(now); // drena sobra de execução anterior nesta era
  const due = new Date(now.getTime() - HOUR);
  const published = await createVacancy('publicada', due);
  const alerting = await createVacancy('alertando', due);
  assert.equal(await service.expireDue(now), 2);
  for (const vacancy of [published, alerting]) {
    assert.equal((await snapshot(vacancy.id)).state, 'expirada');
    const rows = await prisma.transition.findMany({
      where: { vacancyId: vacancy.id },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.origin, 'motor');
    assert.equal(rows[0]?.toState, 'expirada');
  }
});

test('C18 - expireDue não toca futura nem outros estados', async () => {
  const now = era(2);
  await service.expireDue(now);
  const due = new Date(now.getTime() - HOUR);
  const vacancies = [
    await createVacancy('publicada', new Date(now.getTime() + MINUTE)),
    await createVacancy('reservada', due),
    await createVacancy('realizada', due),
    await createVacancy('expirada', due),
    await createVacancy('cancelada', due),
  ];
  const before = await Promise.all(vacancies.map((v) => snapshot(v.id)));
  assert.equal(await service.expireDue(now), 0);
  assert.deepEqual(
    await Promise.all(vacancies.map((v) => snapshot(v.id))),
    before,
  );
});

test('C19 - expireDue repetido devolve 0', async () => {
  const now = era(3);
  await service.expireDue(now);
  const vacancy = await createVacancy(
    'publicada',
    new Date(now.getTime() - HOUR),
  );
  assert.equal(await service.expireDue(now), 1);
  const afterFirst = await snapshot(vacancy.id);
  assert.equal(afterFirst.state, 'expirada');
  assert.equal(await service.expireDue(now), 0);
  assert.deepEqual(await snapshot(vacancy.id), afterFirst);
});

test('C20 - expireDue não altera reservas', async () => {
  const now = era(4);
  await service.expireDue(now);
  const due = new Date(now.getTime() - HOUR);
  const patient = await fixtures.createPatient();
  const alerting = await createVacancy('alertando', due);
  const reserved = await createVacancy('reservada', due);
  const reservation = (
    vacancy: typeof alerting,
    state: 'aguardando_pagamento' | 'confirmada',
  ) =>
    prisma.reservation.create({
      data: {
        slotId: vacancy.slotId, // mesmo horário da vaga
        vacancyId: vacancy.id,
        patientId: patient.id,
        type: 'encaixe',
        state,
        chargedPriceCents: 20000,
        depositCents: 4000,
        paymentMethod: 'pix',
      },
    });
  await reservation(alerting, 'aguardando_pagamento');
  await reservation(reserved, 'confirmada');
  const read = () =>
    prisma.reservation.findMany({
      where: { vacancyId: { in: [alerting.id, reserved.id] } },
      orderBy: { id: 'asc' },
    });
  const before = await read();
  assert.equal(before.length, 2);
  await service.expireDue(now);
  assert.deepEqual(await read(), before);
});

test('C21 - expirar antes do horário recusa com 409', async () => {
  for (const state of ['publicada', 'alertando'] as const) {
    const vacancy = await createVacancy(state, new Date(Date.now() + HOUR));
    const before = await snapshot(vacancy.id);
    await assertConflict(service.transition(vacancy.id, 'expirada', meta()));
    assert.deepEqual(await snapshot(vacancy.id), before);
  }
});

test('C22 - falha de uma vaga não para o expireDue', async () => {
  const now = era(5);
  await service.expireDue(now);
  const due = new Date(now.getTime() - HOUR);
  const a = await createVacancy('alertando', due);
  const b = await createVacancy('alertando', due);
  const c = await createVacancy('alertando', due);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let locked!: () => void;
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.vacancy.updateMany({
        where: { id: a.id },
        data: { state: 'reservada' },
      });
      locked();
      await gate;
    },
    { timeout: 10_000 },
  );
  await isLocked;
  const run = service.expireDue(now);
  await sleep(300);
  release();
  await holder;

  assert.equal(await run, 2);
  assert.equal((await snapshot(b.id)).state, 'expirada');
  assert.equal((await snapshot(c.id)).state, 'expirada');
  assert.equal((await snapshot(a.id)).state, 'reservada');
  assert.equal(
    await prisma.transition.count({
      where: { vacancyId: a.id, toState: 'expirada' },
    }),
    0,
  );
});

// S5 - log da aplicação

test('C23 - recusa registra warn sem motivo', async () => {
  const vacancy = await createVacancy('publicada');
  const marker = `motivo-secreto-${randomUUID()}`;
  const warn = mock.method(Logger.prototype, 'warn', () => undefined);
  try {
    await assertConflict(
      service.transition(vacancy.id, 'realizada', meta('clinica', marker)),
    );
    assert.equal(warn.mock.callCount(), 1);
    const args = warn.mock.calls[0]?.arguments ?? [];
    const text = String(args[0]);
    for (const part of [vacancy.id, 'publicada', 'realizada', 'clinica']) {
      assert.ok(text.includes(part), `esperava ${part} em ${text}`);
    }
    assert.ok(!JSON.stringify(args).includes(marker));
  } finally {
    warn.mock.restore();
  }
});

// HACK-32 - ressalva 2 do 29 e relógio da demo (checks.md do HACK-32)

test('HACK-32 C16 - erro que não é 409 numa vaga não para o expireDue', async () => {
  const now = era(6);
  await service.expireDue(now);
  const due = new Date(now.getTime() - HOUR);
  const a = await createVacancy('alertando', due);
  const b = await createVacancy('alertando', due);
  const c = await createVacancy('alertando', due);
  const spy = replaceTransaction(
    (original) => (fn, options) =>
      original(
        (tx) =>
          fn(
            wrap(tx, {
              vacancy: wrap(tx.vacancy, {
                findUnique: async (args: Prisma.VacancyFindUniqueArgs) => {
                  if (args.where.id === b.id) {
                    throw new Error('falha forçada que não é 409');
                  }
                  return tx.vacancy.findUnique(args);
                },
              }),
            }),
          ),
        options,
      ),
  );
  const warn = mock.method(Logger.prototype, 'warn', () => undefined);
  let expired: number;
  try {
    expired = await service.expireDue(now);
  } finally {
    spy.restore();
    warn.mock.restore();
  }
  assert.equal(expired, 2);
  assert.equal((await snapshot(a.id)).state, 'expirada');
  assert.equal((await snapshot(c.id)).state, 'expirada');
  assert.equal((await snapshot(b.id)).state, 'alertando');
  const lines = warn.mock.calls.map((call) => String(call.arguments[0]));
  assert.equal(lines.filter((line) => line.includes(b.id)).length, 1);
});

test('HACK-32 C22 - serviço de vagas usa o relógio da demo', async () => {
  const clock = app.get(ClockService);
  await clock.reset();
  try {
    await clock.advance(25 * 60);
    const before = clock.now();
    const vacancy = await publishVacancy(new Date(Date.now() + 48 * HOUR));
    await service.transition(vacancy.id, 'alertando', meta());
    const after = clock.now();
    const rows = await service.timeline(vacancy.id);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      const at = row.occurredAt.getTime();
      assert.ok(
        at >= before.getTime() && at <= after.getTime(),
        `${row.occurredAt.toISOString()} fora de [${before.toISOString()}, ${after.toISOString()}]`,
      );
      assert.ok(
        at - Date.now() > 24 * HOUR,
        'occurredAt devia estar ~25 h à frente',
      );
    }

    await service.expireDue(); // drena o que o relógio adiantado já venceu
    const target = await createVacancy(
      'publicada',
      new Date(Date.now() + HOUR),
    );
    assert.equal(await service.expireDue(), 1);
    assert.equal((await snapshot(target.id)).state, 'expirada');
  } finally {
    await clock.reset();
  }
});

test('HACK-32 C23 - occurredAt continua crescente quando o relógio recua', async () => {
  const clock = app.get(ClockService);
  await clock.reset();
  try {
    const vacancy = await publishVacancy(new Date(Date.now() + 48 * HOUR));
    await clock.advance(60);
    const ahead = await service.transition(vacancy.id, 'alertando', meta());
    assert.equal(ahead.state, 'alertando');
    await clock.reset();
    await service.transition(vacancy.id, 'alertando', meta());
    const rows = await service.timeline(vacancy.id);
    const [, first, second] = rows;
    assert.ok(first && second);
    assert.ok(first.occurredAt.getTime() - Date.now() > 50 * MINUTE);
    assert.equal(second.occurredAt.getTime(), first.occurredAt.getTime() + 1);
  } finally {
    await clock.reset();
  }
});
