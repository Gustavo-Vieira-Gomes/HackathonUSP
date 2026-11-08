import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { loadEnv } from '../config/env';
import { PrismaService } from './prisma.service';

/**
 * Prova o modelo de dados da fatia 1 do HACK-13 contra o Postgres do worktree
 * (DATABASE_URL do .env da API). Cada `User` criado leva um marcador no e-mail;
 * o C13 apaga tudo o que o arquivo gravou e confere que nada sobrou.
 */
const prisma = new PrismaService(loadEnv(process.env));
const suffix = `.${randomUUID().slice(0, 8)}@schema.teste.local`;
const userIds: string[] = [];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function createUser(role: 'clinica' | 'paciente') {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: `Teste ${role}`,
      email: `${randomUUID()}${suffix}`,
      role,
    },
  });
  userIds.push(user.id);
  return user;
}

function clinicData(userId: string) {
  return {
    userId,
    name: 'Clínica Teste',
    address: 'Av. Prof. Luciano Gualberto, 380',
    latitude: -23.5614,
    longitude: -46.7307,
    cnes: randomUUID().replace(/-/g, '').slice(0, 7),
    technicalManager: 'Dra. Teste, CRM 000000',
  };
}

async function createClinic() {
  const user = await createUser('clinica');
  return prisma.clinic.create({ data: clinicData(user.id) });
}

async function createPatient() {
  const user = await createUser('paciente');
  return prisma.patient.create({
    data: {
      userId: user.id,
      phone: '+5511999990000',
      healthDataConsentAt: new Date(),
    },
  });
}

function examData(
  clinicId: string,
  overrides: Partial<{
    tussCode: string;
    fullPriceCents: number;
    floorPriceCents: number;
    toleranceMinutes: number;
    maxTravelMinutes: number;
  }> = {},
) {
  return {
    clinicId,
    tussCode: '40901122',
    name: 'Ultrassonografia de abdome total',
    fullPriceCents: 30000,
    floorPriceCents: 18000,
    minLeadMinutes: 120,
    preparationCondition: 'jejum',
    preparationHours: 8,
    contraindications: [],
    toleranceMinutes: 15,
    maxTravelMinutes: 30,
    questionnaireKey: 'ultrassom-abdome-total',
    questionnaireVersion: 1,
    ...overrides,
  };
}

function subscriptionData(patientId: string, tussCode = '40901122') {
  return {
    patientId,
    tussCode,
    maxPriceCents: 25000,
    latitude: -23.5614,
    longitude: -46.7307,
    radiusMeters: 5000,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

/** Código do Prisma (`P2002`…) ou SQLSTATE do Postgres, onde quer que o erro o carregue. */
function errorCodes(error: unknown, seen = new Set<unknown>()): string[] {
  if (error === null || typeof error !== 'object' || seen.has(error)) return [];
  seen.add(error);
  const codes: string[] = [];
  const record = error as Record<string, unknown>;
  for (const key of ['code', 'originalCode']) {
    if (typeof record[key] === 'string') codes.push(record[key]);
  }
  if (typeof record.message === 'string') {
    codes.push(...(record.message.match(/\b(?:P\d{4}|\d{5})\b/g) ?? []));
  }
  for (const key of ['meta', 'cause', 'driverAdapterError']) {
    codes.push(...errorCodes(record[key], seen));
  }
  if (record.meta && typeof record.meta === 'object') {
    for (const value of Object.values(record.meta)) {
      codes.push(...errorCodes(value, seen));
    }
  }
  return codes;
}

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(
      errorCodes(error).includes(code),
      `esperava ${code}, veio ${errorCodes(error).join(', ') || String(error)}`,
    );
    return true;
  });
}

before(async () => {
  await prisma.$connect();
});

const clinicWhere = () => ({ clinic: { userId: { in: userIds } } });
const patientWhere = () => ({ patient: { userId: { in: userIds } } });

/** Apaga o que o arquivo gravou; as FKs restrict exigem inscrições e exames antes do User. */
async function cleanup() {
  await prisma.subscription.deleteMany({ where: patientWhere() });
  await prisma.exam.deleteMany({ where: clinicWhere() });
  await prisma.user.deleteMany({ where: { email: { endsWith: suffix } } });
}

// Roda também quando o filtro de nome pula o C13.
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('C4 - Clinic sem configuração recebe os padrões 5, 20, 5 e 10', async () => {
  const clinic = await createClinic();
  assert.equal(clinic.dailyDiscountCap, 5);
  assert.equal(clinic.depositPercent, 20);
  assert.equal(clinic.waveSize, 5);
  assert.equal(clinic.waveWindowMinutes, 10);
});

test('C5 - os 7 modelos novos geram id UUID sem informar id', async () => {
  const clinic = await createClinic();
  const hours = await prisma.clinicOpeningHours.create({
    data: {
      clinicId: clinic.id,
      weekday: 1,
      startMinute: 480,
      endMinute: 1080,
    },
  });
  const exam = await prisma.exam.create({ data: examData(clinic.id) });
  const step = await prisma.priceStep.create({
    data: { examId: exam.id, leadMinutes: 2880, discountPercent: 10 },
  });
  const patient = await createPatient();
  const subscription = await prisma.subscription.create({
    data: subscriptionData(patient.id),
  });
  const window = await prisma.subscriptionWindow.create({
    data: {
      subscriptionId: subscription.id,
      weekday: 2,
      startMinute: 420,
      endMinute: 720,
    },
  });
  for (const row of [
    clinic,
    hours,
    exam,
    step,
    patient,
    subscription,
    window,
  ]) {
    assert.match(row.id, UUID);
  }
});

test('C7 - CHECK de Exam recusa piso > cheio, X = 0 e Y = 0 com 23514 e aceita as bordas', async () => {
  const clinic = await createClinic();
  const refused = [
    { fullPriceCents: 10000, floorPriceCents: 10001 },
    { toleranceMinutes: 0 },
    { maxTravelMinutes: 0 },
  ];
  for (const [index, overrides] of refused.entries()) {
    await rejectsWith(
      prisma.exam.create({
        data: examData(clinic.id, {
          tussCode: `9000000${index}`,
          ...overrides,
        }),
      }),
      '23514',
    );
  }
  assert.equal(await prisma.exam.count({ where: { clinicId: clinic.id } }), 0);

  const accepted = await prisma.exam.create({
    data: examData(clinic.id, {
      fullPriceCents: 10000,
      floorPriceCents: 10000,
      toleranceMinutes: 1,
      maxTravelMinutes: 1,
    }),
  });
  assert.equal(accepted.floorPriceCents, accepted.fullPriceCents);
  assert.equal(await prisma.exam.count({ where: { clinicId: clinic.id } }), 1);
});

test('C8 - segundo perfil para o mesmo userId é recusado com P2002', async () => {
  const clinic = await createClinic();
  await rejectsWith(
    prisma.clinic.create({ data: clinicData(clinic.userId) }),
    'P2002',
  );
  assert.equal(
    await prisma.clinic.count({ where: { userId: clinic.userId } }),
    1,
  );

  const patient = await createPatient();
  await rejectsWith(
    prisma.patient.create({
      data: {
        userId: patient.userId,
        phone: '+5511999990001',
        healthDataConsentAt: new Date(),
      },
    }),
    'P2002',
  );
  assert.equal(
    await prisma.patient.count({ where: { userId: patient.userId } }),
    1,
  );
});

test('C9 - apagar o User apaga a Clinic sem exames e o Patient sem inscrições', async () => {
  const clinic = await createClinic();
  await prisma.user.delete({ where: { id: clinic.userId } });
  assert.equal(await prisma.clinic.count({ where: { id: clinic.id } }), 0);

  const patient = await createPatient();
  await prisma.user.delete({ where: { id: patient.userId } });
  assert.equal(await prisma.patient.count({ where: { id: patient.id } }), 0);
});

test('C10 - CNES repetido e TUSS repetido na mesma clínica são recusados com P2002', async () => {
  const clinic = await createClinic();
  const other = await createUser('clinica');
  await rejectsWith(
    prisma.clinic.create({
      data: { ...clinicData(other.id), cnes: clinic.cnes },
    }),
    'P2002',
  );
  assert.equal(await prisma.clinic.count({ where: { cnes: clinic.cnes } }), 1);

  await prisma.exam.create({ data: examData(clinic.id) });
  await rejectsWith(prisma.exam.create({ data: examData(clinic.id) }), 'P2002');
  assert.equal(await prisma.exam.count({ where: { clinicId: clinic.id } }), 1);

  const secondClinic = await createClinic();
  const sameTuss = await prisma.exam.create({
    data: examData(secondClinic.id),
  });
  assert.equal(sameTuss.tussCode, '40901122');
});

test('C11 - segunda inscrição do mesmo paciente no mesmo TUSS é recusada com P2002', async () => {
  const patient = await createPatient();
  await prisma.subscription.create({ data: subscriptionData(patient.id) });
  await rejectsWith(
    prisma.subscription.create({ data: subscriptionData(patient.id) }),
    'P2002',
  );
  assert.equal(
    await prisma.subscription.count({ where: { patientId: patient.id } }),
    1,
  );

  const other = await createPatient();
  const sameTuss = await prisma.subscription.create({
    data: subscriptionData(other.id),
  });
  assert.equal(sameTuss.tussCode, '40901122');
});

test('C12 - regra de exclusão das 5 FKs internas do domínio', async () => {
  // Clinic -> Exam: restrict.
  const clinic = await createClinic();
  const exam = await prisma.exam.create({ data: examData(clinic.id) });
  await assert.rejects(prisma.clinic.delete({ where: { id: clinic.id } }));
  assert.equal(await prisma.clinic.count({ where: { id: clinic.id } }), 1);
  assert.equal(await prisma.exam.count({ where: { id: exam.id } }), 1);

  // Patient -> Subscription: restrict.
  const patient = await createPatient();
  const subscription = await prisma.subscription.create({
    data: subscriptionData(patient.id),
  });
  await assert.rejects(prisma.patient.delete({ where: { id: patient.id } }));
  assert.equal(await prisma.patient.count({ where: { id: patient.id } }), 1);
  assert.equal(
    await prisma.subscription.count({ where: { id: subscription.id } }),
    1,
  );

  // Clinic -> ClinicOpeningHours: cascata.
  const bare = await createClinic();
  await prisma.clinicOpeningHours.create({
    data: { clinicId: bare.id, weekday: 3, startMinute: 480, endMinute: 720 },
  });
  await prisma.clinic.delete({ where: { id: bare.id } });
  assert.equal(
    await prisma.clinicOpeningHours.count({ where: { clinicId: bare.id } }),
    0,
  );

  // Exam -> PriceStep: cascata.
  await prisma.priceStep.create({
    data: { examId: exam.id, leadMinutes: 1440, discountPercent: 20 },
  });
  await prisma.exam.delete({ where: { id: exam.id } });
  assert.equal(await prisma.priceStep.count({ where: { examId: exam.id } }), 0);

  // Subscription -> SubscriptionWindow: cascata.
  await prisma.subscriptionWindow.create({
    data: {
      subscriptionId: subscription.id,
      weekday: 4,
      startMinute: 600,
      endMinute: 900,
    },
  });
  await prisma.subscription.delete({ where: { id: subscription.id } });
  assert.equal(
    await prisma.subscriptionWindow.count({
      where: { subscriptionId: subscription.id },
    }),
    0,
  );
});

test('C13 - a suíte apaga tudo o que gravou', async () => {
  await cleanup();

  const remaining = await Promise.all([
    prisma.user.count({ where: { email: { endsWith: suffix } } }),
    prisma.clinic.count({ where: { userId: { in: userIds } } }),
    prisma.patient.count({ where: { userId: { in: userIds } } }),
    prisma.clinicOpeningHours.count({ where: clinicWhere() }),
    prisma.exam.count({ where: clinicWhere() }),
    prisma.priceStep.count({ where: { exam: clinicWhere() } }),
    prisma.subscription.count({ where: patientWhere() }),
    prisma.subscriptionWindow.count({
      where: { subscription: patientWhere() },
    }),
  ]);
  assert.deepEqual(remaining, [0, 0, 0, 0, 0, 0, 0, 0]);
});
