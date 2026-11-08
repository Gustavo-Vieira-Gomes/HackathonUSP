import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { loadEnv } from '../config/env';
import type {
  Prisma,
  ReservationState,
  ReservationType,
  VacancyState,
} from '../generated/prisma/client';
import {
  clinicData,
  createSchemaFixtures,
  errorCodes,
  examData,
  rejectsWith,
  subscriptionData,
  UUID,
} from '../testing/schema-fixtures';
import { PrismaService } from './prisma.service';

/**
 * Prova o modelo de dados da fatia 2 do HACK-13 (horário, vaga, reserva, alerta,
 * transição, a trava da RN-41 e as faixas da porta 8) contra o Postgres do worktree.
 * Cada teste começa pelo id do check em checks.md; o C22 apaga tudo o que o arquivo
 * gravou e confere que nada sobrou.
 */
const prisma = new PrismaService(loadEnv(process.env));
const { suffix, userIds, createUser, createClinic, createPatient } =
  createSchemaFixtures(prisma);

let tussSeq = 0;
const nextTuss = () => `7${String(++tussSeq).padStart(7, '0')}`;

let slotSeq = 0;
const BASE_TIME = Date.UTC(2026, 11, 1, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

async function createExam(clinicId: string) {
  return prisma.exam.create({
    data: examData(clinicId, { tussCode: nextTuss() }),
  });
}

/** Clínica com um exame, paciente com uma inscrição: a base de quase todo teste. */
async function createBase() {
  const clinic = await createClinic();
  const exam = await createExam(clinic.id);
  const patient = await createPatient();
  const subscription = await prisma.subscription.create({
    data: subscriptionData(patient.id, exam.tussCode),
  });
  return { clinic, exam, patient, subscription };
}

async function createSlot(clinicId: string, examId: string) {
  const startsAt = new Date(BASE_TIME + ++slotSeq * HOUR);
  return prisma.slot.create({
    data: {
      clinicId,
      examId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
      origin: 'agenda',
    },
  });
}

async function createVacancy(
  slotId: string,
  state: VacancyState = 'publicada',
) {
  return prisma.vacancy.create({
    data: { slotId, origin: 'cancelamento', state, currentPriceCents: 20000 },
  });
}

function reservationData(input: {
  slotId: string;
  patientId: string;
  vacancyId?: string | null;
  type?: ReservationType;
  state?: ReservationState;
  paymentMethod?: 'pix' | 'cartao' | 'no_local';
}): Prisma.ReservationUncheckedCreateInput {
  const type = input.type ?? (input.vacancyId ? 'encaixe' : 'comum');
  return {
    slotId: input.slotId,
    patientId: input.patientId,
    vacancyId: input.vacancyId ?? null,
    type,
    state: input.state ?? 'aguardando_pagamento',
    chargedPriceCents: 20000,
    depositCents: 4000,
    paymentMethod: input.paymentMethod ?? 'pix',
  };
}

async function createReservation(input: Parameters<typeof reservationData>[0]) {
  return prisma.reservation.create({ data: reservationData(input) });
}

/** Slot com uma vaga publicada e N reservas de encaixe aguardando pagamento. */
async function vacancyWithPending(count: number) {
  const { clinic, exam, patient } = await createBase();
  const slot = await createSlot(clinic.id, exam.id);
  const vacancy = await createVacancy(slot.id);
  const reservations = [];
  for (let i = 0; i < count; i += 1) {
    reservations.push(
      await createReservation({
        slotId: slot.id,
        patientId: patient.id,
        vacancyId: vacancy.id,
      }),
    );
  }
  return { clinic, exam, patient, slot, vacancy, reservations };
}

const confirm = (id: string) =>
  prisma.reservation.update({ where: { id }, data: { state: 'confirmada' } });

async function stateOf(id: string) {
  const row = await prisma.reservation.findUniqueOrThrow({ where: { id } });
  return row.state;
}

/** Exclusão bloqueada por uma FK Restrict específica: P2003, SQLSTATE 23503 e o nome dela. */
async function rejectsRestrict(promise: Promise<unknown>, constraint: string) {
  await assert.rejects(promise, (error: unknown) => {
    const codes = errorCodes(error);
    assert.ok(
      codes.includes('P2003'),
      `esperava P2003, veio ${codes.join(', ')}`,
    );
    assert.ok(
      codes.includes('23503'),
      `esperava 23503, veio ${codes.join(', ')}`,
    );
    const text = `${String(error)} ${JSON.stringify((error as { meta?: unknown }).meta ?? {})}`;
    assert.ok(text.includes(constraint), `esperava ${constraint} em ${text}`);
    return true;
  });
}

before(async () => {
  await prisma.$connect();
});

const ownClinic = () => ({ clinic: { userId: { in: userIds } } });
const ownSlot = () => ({ slot: ownClinic() });
const ownPatient = () => ({ patient: { userId: { in: userIds } } });

/** Apaga o que o arquivo gravou, filho → pai, porque as FKs desta fatia são Restrict. */
async function cleanup() {
  await prisma.transition.deleteMany({
    where: {
      OR: [{ vacancy: ownSlot() }, { reservation: ownSlot() }],
    },
  });
  await prisma.alert.deleteMany({
    where: { OR: [{ vacancy: ownSlot() }, { subscription: ownPatient() }] },
  });
  await prisma.reservation.deleteMany({
    where: { OR: [ownSlot(), ownPatient()] },
  });
  await prisma.vacancy.deleteMany({ where: ownSlot() });
  await prisma.slot.deleteMany({ where: ownClinic() });
  await prisma.subscription.deleteMany({ where: ownPatient() });
  await prisma.exam.deleteMany({ where: ownClinic() });
  await prisma.user.deleteMany({ where: { email: { endsWith: suffix } } });
}

// Roda também quando o filtro de nome pula o C22.
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('C4 - valor fora do enum em Vacancy.state e Reservation.state é recusado com 22P02', async () => {
  const { vacancy, reservations } = await vacancyWithPending(1);
  const reservation = reservations[0]!;

  await rejectsWith(
    prisma.$executeRaw`UPDATE "Vacancy" SET "state" = ${'ativa'}::"VacancyState" WHERE "id" = ${vacancy.id}::uuid`,
    '22P02',
  );
  await rejectsWith(
    prisma.$executeRaw`UPDATE "Reservation" SET "state" = ${'paga'}::"ReservationState" WHERE "id" = ${reservation.id}::uuid`,
    '22P02',
  );

  const vacancyAfter = await prisma.vacancy.findUniqueOrThrow({
    where: { id: vacancy.id },
  });
  assert.equal(vacancyAfter.state, 'publicada');
  assert.equal(await stateOf(reservation.id), 'aguardando_pagamento');
});

test('C6 - os 5 modelos novos geram id UUID sem informar id', async () => {
  const { slot, vacancy, reservations, patient } = await vacancyWithPending(1);
  const subscription = await prisma.subscription.create({
    data: subscriptionData(patient.id, nextTuss()),
  });
  const alert = await prisma.alert.create({
    data: {
      vacancyId: vacancy.id,
      subscriptionId: subscription.id,
      wave: 1,
      channel: 'push',
    },
  });
  const transition = await prisma.transition.create({
    data: {
      vacancyId: vacancy.id,
      toState: 'publicada',
      origin: 'clinica',
      reason: 'vaga criada',
    },
  });
  for (const row of [slot, vacancy, reservations[0]!, alert, transition]) {
    assert.match(row.id, UUID);
  }
});

test('C7 - segunda confirmação na mesma vaga é recusada com P2002', async () => {
  for (const existing of ['confirmada', 'realizada'] as const) {
    const { reservations } = await vacancyWithPending(2);
    const [first, second] = [reservations[0]!, reservations[1]!];
    await prisma.reservation.update({
      where: { id: first.id },
      data: { state: existing },
    });

    await rejectsWith(confirm(second.id), 'P2002');
    assert.equal(await stateOf(second.id), 'aguardando_pagamento', existing);
  }
});

test('C8 - duas confirmações simultâneas: exatamente uma vence, 5 rodadas', async () => {
  for (let round = 0; round < 5; round += 1) {
    const { reservations } = await vacancyWithPending(2);
    const [first, second] = [reservations[0]!, reservations[1]!];

    const results = await Promise.allSettled([
      confirm(first.id),
      confirm(second.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    assert.equal(fulfilled.length, 1, `rodada ${round}`);
    assert.equal(rejected.length, 1, `rodada ${round}`);
    assert.ok(
      errorCodes(rejected[0]!.reason).includes('P2002'),
      `rodada ${round}`,
    );

    const states = [await stateOf(first.id), await stateOf(second.id)].sort();
    assert.deepEqual(states, ['aguardando_pagamento', 'confirmada']);
  }
});

test('C9 - a mesma vaga aceita várias reservas não ativas ao lado de uma confirmada', async () => {
  const { slot, vacancy, patient, reservations } = await vacancyWithPending(1);
  await confirm(reservations[0]!.id);

  const inactive = [
    'aguardando_pagamento',
    'expirada',
    'cancelada',
    'no_show',
  ] as const;
  for (const state of inactive) {
    for (let i = 0; i < 2; i += 1) {
      await createReservation({
        slotId: slot.id,
        patientId: patient.id,
        vacancyId: vacancy.id,
        state,
      });
    }
  }

  assert.equal(
    await prisma.reservation.count({
      where: { vacancyId: vacancy.id, state: { in: [...inactive] } },
    }),
    8,
  );
  assert.equal(
    await prisma.reservation.count({
      where: { vacancyId: vacancy.id, state: 'confirmada' },
    }),
    1,
  );
});

test('C10 - cancelar a reserva confirmada libera a vaga para outra confirmação', async () => {
  const { reservations } = await vacancyWithPending(2);
  const [first, second] = [reservations[0]!, reservations[1]!];
  await confirm(first.id);
  await prisma.reservation.update({
    where: { id: first.id },
    data: { state: 'cancelada' },
  });

  await confirm(second.id);
  assert.equal(await stateOf(second.id), 'confirmada');
});

test('C11 - horário com reserva comum ativa recusa confirmar encaixe no mesmo horário', async () => {
  for (const existing of ['confirmada', 'realizada'] as const) {
    const { clinic, exam, patient } = await createBase();
    const slot = await createSlot(clinic.id, exam.id);
    await createReservation({
      slotId: slot.id,
      patientId: patient.id,
      type: 'comum',
      state: existing,
    });
    const vacancy = await createVacancy(slot.id);
    const encaixe = await createReservation({
      slotId: slot.id,
      patientId: patient.id,
      vacancyId: vacancy.id,
    });

    await rejectsWith(confirm(encaixe.id), 'P2002');
    assert.equal(await stateOf(encaixe.id), 'aguardando_pagamento', existing);
  }
});

test('C12 - uma vaga ativa por horário: 3 estados recusam a segunda, 3 liberam', async () => {
  const { clinic, exam } = await createBase();

  for (const existing of ['publicada', 'alertando', 'reservada'] as const) {
    const slot = await createSlot(clinic.id, exam.id);
    await createVacancy(slot.id, existing);
    await rejectsWith(createVacancy(slot.id), 'P2002');
    assert.equal(
      await prisma.vacancy.count({ where: { slotId: slot.id } }),
      1,
      existing,
    );
  }

  for (const existing of ['cancelada', 'expirada', 'realizada'] as const) {
    const slot = await createSlot(clinic.id, exam.id);
    await createVacancy(slot.id, existing);
    const second = await createVacancy(slot.id);
    assert.equal(second.state, 'publicada', existing);
    assert.equal(
      await prisma.vacancy.count({ where: { slotId: slot.id } }),
      2,
      existing,
    );
  }
});

test('C13 - tipo da reserva e vaga: 3 combinações recusadas com 23514, 2 aceitas', async () => {
  const { slot, vacancy, patient } = await vacancyWithPending(0);
  const refused: Parameters<typeof reservationData>[0][] = [
    {
      slotId: slot.id,
      patientId: patient.id,
      type: 'comum',
      vacancyId: vacancy.id,
    },
    {
      slotId: slot.id,
      patientId: patient.id,
      type: 'encaixe',
      vacancyId: null,
    },
    {
      slotId: slot.id,
      patientId: patient.id,
      type: 'no_show',
      vacancyId: null,
    },
  ];
  for (const input of refused) {
    await rejectsWith(createReservation(input), '23514');
  }
  assert.equal(
    await prisma.reservation.count({ where: { slotId: slot.id } }),
    0,
  );

  const comum = await createReservation({
    slotId: slot.id,
    patientId: patient.id,
    type: 'comum',
  });
  const encaixe = await createReservation({
    slotId: slot.id,
    patientId: patient.id,
    type: 'encaixe',
    vacancyId: vacancy.id,
  });
  assert.equal(comum.vacancyId, null);
  assert.equal(encaixe.vacancyId, vacancy.id);
});

test('C14 - pagamento no local só na reserva comum (RN-39)', async () => {
  const { slot, vacancy, patient } = await vacancyWithPending(0);
  for (const type of ['encaixe', 'no_show'] as const) {
    await rejectsWith(
      createReservation({
        slotId: slot.id,
        patientId: patient.id,
        vacancyId: vacancy.id,
        type,
        paymentMethod: 'no_local',
      }),
      '23514',
    );
  }
  assert.equal(
    await prisma.reservation.count({ where: { slotId: slot.id } }),
    0,
  );

  const comum = await createReservation({
    slotId: slot.id,
    patientId: patient.id,
    type: 'comum',
    paymentMethod: 'no_local',
  });
  assert.equal(comum.paymentMethod, 'no_local');
});

test('C15 - transição precisa de exatamente um alvo', async () => {
  const { vacancy, reservations } = await vacancyWithPending(1);
  const reservation = reservations[0]!;
  const base = {
    toState: 'confirmada',
    origin: 'motor' as const,
    reason: 'teste',
  };

  await rejectsWith(prisma.transition.create({ data: base }), '23514');
  await rejectsWith(
    prisma.transition.create({
      data: { ...base, vacancyId: vacancy.id, reservationId: reservation.id },
    }),
    '23514',
  );

  const onVacancy = await prisma.transition.create({
    data: { ...base, vacancyId: vacancy.id, fromState: null },
  });
  const onReservation = await prisma.transition.create({
    data: {
      ...base,
      reservationId: reservation.id,
      fromState: 'aguardando_pagamento',
    },
  });
  assert.equal(onVacancy.fromState, null);
  assert.equal(onReservation.reservationId, reservation.id);
  assert.equal(
    await prisma.transition.count({
      where: {
        OR: [{ vacancyId: vacancy.id }, { reservationId: reservation.id }],
      },
    }),
    2,
  );
});

test('C16 - horário com fim igual ou antes do início é recusado com 23514', async () => {
  const { clinic, exam } = await createBase();
  const startsAt = new Date(BASE_TIME + 1000 * HOUR);
  const minute = 60 * 1000;
  const slotWith = (endsAt: Date) =>
    prisma.slot.create({
      data: {
        clinicId: clinic.id,
        examId: exam.id,
        startsAt,
        endsAt,
        origin: 'manual',
      },
    });

  await rejectsWith(slotWith(startsAt), '23514');
  await rejectsWith(slotWith(new Date(startsAt.getTime() - minute)), '23514');
  assert.equal(await prisma.slot.count({ where: { clinicId: clinic.id } }), 0);

  const ok = await slotWith(new Date(startsAt.getTime() + minute));
  assert.equal(ok.endsAt.getTime() - ok.startsAt.getTime(), minute);
});

test('C17 - segundo alerta da mesma vaga, inscrição e canal é recusado com P2002', async () => {
  const { clinic, exam, subscription } = await createBase();
  const slot = await createSlot(clinic.id, exam.id);
  const vacancy = await createVacancy(slot.id);
  const alert = (channel: 'push' | 'email') =>
    prisma.alert.create({
      data: {
        vacancyId: vacancy.id,
        subscriptionId: subscription.id,
        wave: 1,
        channel,
      },
    });

  await alert('push');
  await rejectsWith(alert('push'), 'P2002');
  await alert('email');
  assert.equal(
    await prisma.alert.count({ where: { vacancyId: vacancy.id } }),
    2,
  );
});

test('C18 - faixas das tabelas da fatia 1: 23 recusas com 23514 e 19 bordas aceitas', async () => {
  type Case = {
    label: string;
    run: () => Promise<unknown>;
    count: () => Promise<number>;
  };

  const clinicCase = async (
    label: string,
    overrides: Partial<{
      dailyDiscountCap: number;
      depositPercent: number;
      waveSize: number;
      waveWindowMinutes: number;
    }>,
  ): Promise<Case> => {
    const user = await createUser('clinica');
    return {
      label,
      run: () =>
        prisma.clinic.create({
          data: { ...clinicData(user.id), ...overrides },
        }),
      count: () => prisma.clinic.count({ where: { userId: user.id } }),
    };
  };

  const clinic = await createClinic();
  const exam = await createExam(clinic.id);
  const patient = await createPatient();
  const subscription = await prisma.subscription.create({
    data: subscriptionData(patient.id, nextTuss()),
  });

  const hoursCase = (
    label: string,
    weekday: number,
    startMinute: number,
    endMinute: number,
  ): Case => ({
    label,
    run: () =>
      prisma.clinicOpeningHours.create({
        data: { clinicId: clinic.id, weekday, startMinute, endMinute },
      }),
    count: () =>
      prisma.clinicOpeningHours.count({
        where: { clinicId: clinic.id, weekday, startMinute, endMinute },
      }),
  });

  const windowCase = (
    label: string,
    weekday: number,
    startMinute: number,
    endMinute: number,
  ): Case => ({
    label,
    run: () =>
      prisma.subscriptionWindow.create({
        data: {
          subscriptionId: subscription.id,
          weekday,
          startMinute,
          endMinute,
        },
      }),
    count: () =>
      prisma.subscriptionWindow.count({
        where: {
          subscriptionId: subscription.id,
          weekday,
          startMinute,
          endMinute,
        },
      }),
  });

  const examCase = (
    label: string,
    overrides: Parameters<typeof examData>[1],
  ): Case => {
    const tussCode = nextTuss();
    return {
      label,
      run: () =>
        prisma.exam.create({
          data: examData(clinic.id, { ...overrides, tussCode }),
        }),
      count: () =>
        prisma.exam.count({ where: { clinicId: clinic.id, tussCode } }),
    };
  };

  const stepCase = (
    label: string,
    leadMinutes: number,
    discountPercent: number,
  ): Case => ({
    label,
    run: () =>
      prisma.priceStep.create({
        data: { examId: exam.id, leadMinutes, discountPercent },
      }),
    count: () =>
      prisma.priceStep.count({ where: { examId: exam.id, leadMinutes } }),
  });

  const subscriptionCase = async (
    label: string,
    maxPriceCents: number,
  ): Promise<Case> => {
    const owner = await createPatient();
    return {
      label,
      run: () =>
        prisma.subscription.create({
          data: { ...subscriptionData(owner.id), maxPriceCents },
        }),
      count: () =>
        prisma.subscription.count({ where: { patientId: owner.id } }),
    };
  };

  const refused: Case[] = [
    await clinicCase('Clinic.dailyDiscountCap -1', { dailyDiscountCap: -1 }),
    await clinicCase('Clinic.depositPercent -1', { depositPercent: -1 }),
    await clinicCase('Clinic.depositPercent 101', { depositPercent: 101 }),
    await clinicCase('Clinic.waveSize 0', { waveSize: 0 }),
    await clinicCase('Clinic.waveWindowMinutes 0', { waveWindowMinutes: 0 }),
    hoursCase('ClinicOpeningHours.weekday -1', -1, 480, 720),
    hoursCase('ClinicOpeningHours.weekday 7', 7, 480, 720),
    hoursCase('ClinicOpeningHours start -1', 1, -1, 720),
    hoursCase('ClinicOpeningHours start = end', 1, 600, 600),
    hoursCase('ClinicOpeningHours end 1441', 1, 480, 1441),
    examCase('Exam.fullPriceCents -1', {
      fullPriceCents: -1,
      floorPriceCents: -1,
    }),
    examCase('Exam.floorPriceCents -1', { floorPriceCents: -1 }),
    examCase('Exam.minLeadMinutes -1', { minLeadMinutes: -1 }),
    examCase('Exam.preparationHours -1', { preparationHours: -1 }),
    stepCase('PriceStep.leadMinutes -1', -1, 10),
    stepCase('PriceStep.discountPercent -1', 30, -1),
    stepCase('PriceStep.discountPercent 101', 31, 101),
    await subscriptionCase('Subscription.maxPriceCents -1', -1),
    windowCase('SubscriptionWindow.weekday -1', -1, 480, 720),
    windowCase('SubscriptionWindow.weekday 7', 7, 480, 720),
    windowCase('SubscriptionWindow start -1', 1, -1, 720),
    windowCase('SubscriptionWindow start = end', 1, 600, 600),
    windowCase('SubscriptionWindow end 1441', 1, 480, 1441),
  ];
  assert.equal(refused.length, 23);

  const accepted: Case[] = [
    await clinicCase('Clinic.dailyDiscountCap 0', { dailyDiscountCap: 0 }),
    await clinicCase('Clinic.depositPercent 0', { depositPercent: 0 }),
    await clinicCase('Clinic.depositPercent 100', { depositPercent: 100 }),
    await clinicCase('Clinic.waveSize 1', { waveSize: 1 }),
    await clinicCase('Clinic.waveWindowMinutes 1', { waveWindowMinutes: 1 }),
    hoursCase('ClinicOpeningHours.weekday 0', 0, 480, 720),
    hoursCase('ClinicOpeningHours.weekday 6', 6, 480, 720),
    hoursCase('ClinicOpeningHours 0-1440', 2, 0, 1440),
    examCase('Exam.fullPriceCents 0', {
      fullPriceCents: 0,
      floorPriceCents: 0,
    }),
    examCase('Exam.floorPriceCents 0', { floorPriceCents: 0 }),
    examCase('Exam.minLeadMinutes 0', { minLeadMinutes: 0 }),
    examCase('Exam.preparationHours 0', { preparationHours: 0 }),
    stepCase('PriceStep.leadMinutes 0', 0, 10),
    stepCase('PriceStep.discountPercent 0', 60, 0),
    stepCase('PriceStep.discountPercent 100', 120, 100),
    await subscriptionCase('Subscription.maxPriceCents 0', 0),
    windowCase('SubscriptionWindow.weekday 0', 0, 480, 720),
    windowCase('SubscriptionWindow.weekday 6', 6, 480, 720),
    windowCase('SubscriptionWindow 0-1440', 2, 0, 1440),
  ];
  assert.equal(accepted.length, 19);

  for (const item of refused) {
    const initial = await item.count();
    await rejectsWith(item.run(), '23514').catch((error: unknown) => {
      throw new Error(`${item.label}: ${String(error)}`);
    });
    assert.equal(await item.count(), initial, item.label);
  }
  for (const item of accepted) {
    const initial = await item.count();
    await item.run().catch((error: unknown) => {
      throw new Error(`${item.label}: ${String(error)}`);
    });
    assert.equal(await item.count(), initial + 1, item.label);
  }
});

test('C19 - faixas das colunas novas: centavos >= 0 e onda >= 1', async () => {
  const { clinic, exam, patient, subscription } = await createBase();
  const slot = await createSlot(clinic.id, exam.id);

  await rejectsWith(
    prisma.vacancy.create({
      data: { slotId: slot.id, origin: 'vazio', currentPriceCents: -1 },
    }),
    '23514',
  );
  const vacancy = await prisma.vacancy.create({
    data: { slotId: slot.id, origin: 'vazio', currentPriceCents: 0 },
  });
  assert.equal(vacancy.currentPriceCents, 0);

  const comum = {
    slotId: slot.id,
    patientId: patient.id,
    type: 'comum' as const,
  };
  await rejectsWith(
    prisma.reservation.create({
      data: { ...reservationData(comum), chargedPriceCents: -1 },
    }),
    '23514',
  );
  await rejectsWith(
    prisma.reservation.create({
      data: { ...reservationData(comum), depositCents: -1 },
    }),
    '23514',
  );
  const free = await prisma.reservation.create({
    data: { ...reservationData(comum), chargedPriceCents: 0, depositCents: 0 },
  });
  assert.equal(free.chargedPriceCents + free.depositCents, 0);

  const alertData = {
    vacancyId: vacancy.id,
    subscriptionId: subscription.id,
    channel: 'push' as const,
  };
  await rejectsWith(
    prisma.alert.create({ data: { ...alertData, wave: 0 } }),
    '23514',
  );
  const first = await prisma.alert.create({ data: { ...alertData, wave: 1 } });
  assert.equal(first.wave, 1);
});

test('C20 - degrau repetido no mesmo exame é recusado com P2002', async () => {
  const clinic = await createClinic();
  const exam = await createExam(clinic.id);
  const other = await createExam(clinic.id);

  await prisma.priceStep.create({
    data: { examId: exam.id, leadMinutes: 1440, discountPercent: 10 },
  });
  await rejectsWith(
    prisma.priceStep.create({
      data: { examId: exam.id, leadMinutes: 1440, discountPercent: 20 },
    }),
    'P2002',
  );
  assert.equal(await prisma.priceStep.count({ where: { examId: exam.id } }), 1);

  const sameLead = await prisma.priceStep.create({
    data: { examId: other.id, leadMinutes: 1440, discountPercent: 20 },
  });
  assert.equal(sameLead.leadMinutes, 1440);
});

test('C21 - as 10 FKs Restrict da fatia 2 recusam apagar o pai com P2003/23503', async () => {
  // Cada caso monta um pai com um único filho, para a recusa vir da FK nomeada.
  const cases: {
    constraint: string;
    setup: () => Promise<{
      remove: () => Promise<unknown>;
      stillThere: () => Promise<number>;
    }>;
  }[] = [
    {
      constraint: 'Slot_clinicId_fkey',
      setup: async () => {
        const owner = await createClinic();
        const examOwner = await createClinic();
        const foreignExam = await createExam(examOwner.id);
        const slot = await createSlot(owner.id, foreignExam.id);
        return {
          remove: () => prisma.clinic.delete({ where: { id: owner.id } }),
          stillThere: async () =>
            (await prisma.clinic.count({ where: { id: owner.id } })) +
            (await prisma.slot.count({ where: { id: slot.id } })),
        };
      },
    },
    {
      constraint: 'Slot_examId_fkey',
      setup: async () => {
        const clinic = await createClinic();
        const exam = await createExam(clinic.id);
        const slot = await createSlot(clinic.id, exam.id);
        return {
          remove: () => prisma.exam.delete({ where: { id: exam.id } }),
          stillThere: async () =>
            (await prisma.exam.count({ where: { id: exam.id } })) +
            (await prisma.slot.count({ where: { id: slot.id } })),
        };
      },
    },
    {
      constraint: 'Vacancy_slotId_fkey',
      setup: async () => {
        const { clinic, exam } = await createBase();
        const slot = await createSlot(clinic.id, exam.id);
        const vacancy = await createVacancy(slot.id);
        return {
          remove: () => prisma.slot.delete({ where: { id: slot.id } }),
          stillThere: async () =>
            (await prisma.slot.count({ where: { id: slot.id } })) +
            (await prisma.vacancy.count({ where: { id: vacancy.id } })),
        };
      },
    },
    {
      constraint: 'Reservation_slotId_fkey',
      setup: async () => {
        const { clinic, exam, patient } = await createBase();
        const slot = await createSlot(clinic.id, exam.id);
        const reservation = await createReservation({
          slotId: slot.id,
          patientId: patient.id,
        });
        return {
          remove: () => prisma.slot.delete({ where: { id: slot.id } }),
          stillThere: async () =>
            (await prisma.slot.count({ where: { id: slot.id } })) +
            (await prisma.reservation.count({ where: { id: reservation.id } })),
        };
      },
    },
    {
      constraint: 'Reservation_vacancyId_fkey',
      setup: async () => {
        const { vacancy, reservations } = await vacancyWithPending(1);
        return {
          remove: () => prisma.vacancy.delete({ where: { id: vacancy.id } }),
          stillThere: async () =>
            (await prisma.vacancy.count({ where: { id: vacancy.id } })) +
            (await prisma.reservation.count({
              where: { id: reservations[0]!.id },
            })),
        };
      },
    },
    {
      constraint: 'Reservation_patientId_fkey',
      setup: async () => {
        const { clinic, exam } = await createBase();
        const slot = await createSlot(clinic.id, exam.id);
        const patient = await createPatient();
        const reservation = await createReservation({
          slotId: slot.id,
          patientId: patient.id,
        });
        return {
          remove: () => prisma.patient.delete({ where: { id: patient.id } }),
          stillThere: async () =>
            (await prisma.patient.count({ where: { id: patient.id } })) +
            (await prisma.reservation.count({ where: { id: reservation.id } })),
        };
      },
    },
    {
      constraint: 'Alert_vacancyId_fkey',
      setup: async () => {
        const { clinic, exam, subscription } = await createBase();
        const slot = await createSlot(clinic.id, exam.id);
        const vacancy = await createVacancy(slot.id);
        const alert = await prisma.alert.create({
          data: {
            vacancyId: vacancy.id,
            subscriptionId: subscription.id,
            wave: 1,
            channel: 'push',
          },
        });
        return {
          remove: () => prisma.vacancy.delete({ where: { id: vacancy.id } }),
          stillThere: async () =>
            (await prisma.vacancy.count({ where: { id: vacancy.id } })) +
            (await prisma.alert.count({ where: { id: alert.id } })),
        };
      },
    },
    {
      constraint: 'Alert_subscriptionId_fkey',
      setup: async () => {
        const { clinic, exam, subscription } = await createBase();
        const slot = await createSlot(clinic.id, exam.id);
        const vacancy = await createVacancy(slot.id);
        const alert = await prisma.alert.create({
          data: {
            vacancyId: vacancy.id,
            subscriptionId: subscription.id,
            wave: 1,
            channel: 'email',
          },
        });
        return {
          remove: () =>
            prisma.subscription.delete({ where: { id: subscription.id } }),
          stillThere: async () =>
            (await prisma.subscription.count({
              where: { id: subscription.id },
            })) + (await prisma.alert.count({ where: { id: alert.id } })),
        };
      },
    },
    {
      constraint: 'Transition_vacancyId_fkey',
      setup: async () => {
        const { clinic, exam } = await createBase();
        const slot = await createSlot(clinic.id, exam.id);
        const vacancy = await createVacancy(slot.id);
        const transition = await prisma.transition.create({
          data: {
            vacancyId: vacancy.id,
            toState: 'publicada',
            origin: 'clinica',
            reason: 'teste',
          },
        });
        return {
          remove: () => prisma.vacancy.delete({ where: { id: vacancy.id } }),
          stillThere: async () =>
            (await prisma.vacancy.count({ where: { id: vacancy.id } })) +
            (await prisma.transition.count({ where: { id: transition.id } })),
        };
      },
    },
    {
      constraint: 'Transition_reservationId_fkey',
      setup: async () => {
        const { clinic, exam, patient } = await createBase();
        const slot = await createSlot(clinic.id, exam.id);
        const reservation = await createReservation({
          slotId: slot.id,
          patientId: patient.id,
        });
        const transition = await prisma.transition.create({
          data: {
            reservationId: reservation.id,
            toState: 'aguardando_pagamento',
            origin: 'paciente',
            reason: 'teste',
          },
        });
        return {
          remove: () =>
            prisma.reservation.delete({ where: { id: reservation.id } }),
          stillThere: async () =>
            (await prisma.reservation.count({
              where: { id: reservation.id },
            })) +
            (await prisma.transition.count({ where: { id: transition.id } })),
        };
      },
    },
  ];
  assert.equal(cases.length, 10);

  for (const item of cases) {
    const { remove, stillThere } = await item.setup();
    await rejectsRestrict(remove(), item.constraint);
    assert.equal(await stillThere(), 2, item.constraint);
  }
});

test('C22 - a suíte apaga tudo o que gravou', async () => {
  await cleanup();

  const remaining = await Promise.all([
    prisma.user.count({ where: { email: { endsWith: suffix } } }),
    prisma.clinic.count({ where: { userId: { in: userIds } } }),
    prisma.patient.count({ where: { userId: { in: userIds } } }),
    prisma.clinicOpeningHours.count({ where: ownClinic() }),
    prisma.exam.count({ where: ownClinic() }),
    prisma.priceStep.count({ where: { exam: ownClinic() } }),
    prisma.subscription.count({ where: ownPatient() }),
    prisma.subscriptionWindow.count({ where: { subscription: ownPatient() } }),
    prisma.slot.count({ where: ownClinic() }),
    prisma.vacancy.count({ where: ownSlot() }),
    prisma.reservation.count({ where: { OR: [ownSlot(), ownPatient()] } }),
    prisma.alert.count({
      where: { OR: [{ vacancy: ownSlot() }, { subscription: ownPatient() }] },
    }),
    prisma.transition.count({
      where: { OR: [{ vacancy: ownSlot() }, { reservation: ownSlot() }] },
    }),
  ]);
  assert.deepEqual(remaining, Array(13).fill(0));
});
