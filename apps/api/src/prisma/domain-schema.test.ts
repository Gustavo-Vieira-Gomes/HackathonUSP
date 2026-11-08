import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { loadEnv } from '../config/env';
import {
  clinicData,
  createSchemaFixtures,
  examData,
  rejectsWith,
  subscriptionData,
  UUID,
} from '../testing/schema-fixtures';
import { PrismaService } from './prisma.service';

/**
 * Prova o modelo de dados da fatia 1 do HACK-13 contra o Postgres do worktree
 * (DATABASE_URL do .env da API). Cada `User` criado leva um marcador no e-mail;
 * o C13 apaga tudo o que o arquivo gravou e confere que nada sobrou.
 */
const prisma = new PrismaService(loadEnv(process.env));
const { suffix, userIds, createUser, createClinic, createPatient } =
  createSchemaFixtures(prisma);

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
  await rejectsWith(
    prisma.clinic.delete({ where: { id: clinic.id } }),
    'P2003',
    '23503',
  );
  assert.equal(await prisma.clinic.count({ where: { id: clinic.id } }), 1);
  assert.equal(await prisma.exam.count({ where: { id: exam.id } }), 1);

  // Patient -> Subscription: restrict.
  const patient = await createPatient();
  const subscription = await prisma.subscription.create({
    data: subscriptionData(patient.id),
  });
  await rejectsWith(
    prisma.patient.delete({ where: { id: patient.id } }),
    'P2003',
    '23503',
  );
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
