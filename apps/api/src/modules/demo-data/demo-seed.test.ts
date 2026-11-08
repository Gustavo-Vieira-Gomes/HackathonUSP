import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { allowedExams } from '@hackathon/contracts';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { examQuestionnairesSeed } from '../exams/exam-questionnaires.seed';
import { MatchingService } from '../vacancies/matching.service';
import {
  protocols,
  readClinics,
  seedDemo,
  validateSeedEnvironment,
} from './demo-seed';

let prisma: PrismaService;
const clinicWhere = { user: { email: { endsWith: '@hack15.demo.invalid' } } };
const patientWhere = { user: { email: { endsWith: '@hack15.demo.invalid' } } };
before(() => {
  prisma = new PrismaService(loadEnv());
});
after(async () => {
  await prisma?.$disconnect();
});

async function snapshot() {
  const clinics = await prisma.clinic.findMany({
    where: clinicWhere,
    orderBy: { cnes: 'asc' },
    include: {
      openingHours: { orderBy: { weekday: 'asc' } },
      exams: {
        orderBy: { tussCode: 'asc' },
        include: { priceSteps: { orderBy: { leadMinutes: 'asc' } } },
      },
    },
  });
  const patients = await prisma.patient.findMany({
    where: patientWhere,
    orderBy: { userId: 'asc' },
    include: {
      subscriptions: { include: { windows: { orderBy: { weekday: 'asc' } } } },
    },
  });
  return {
    clinics: clinics.map((clinic) => ({
      id: clinic.id,
      createdAt: clinic.createdAt,
      hours: clinic.openingHours.map((hours) => hours.id),
      exams: clinic.exams.map((exam) => ({
        id: exam.id,
        createdAt: exam.createdAt,
        steps: exam.priceSteps.map((step) => step.id),
      })),
    })),
    patients: patients.map((patient) => ({
      id: patient.id,
      createdAt: patient.createdAt,
      subscriptions: patient.subscriptions.map((subscription) => ({
        id: subscription.id,
        createdAt: subscription.createdAt,
        windows: subscription.windows.map((window) => window.id),
      })),
    })),
  };
}

test('seed duas vezes preserva IDs, datas e contagens sem duplicar dependências', async () => {
  assert.deepEqual(await seedDemo(prisma), {
    clinics: 10,
    exams: 100,
    patients: 12,
    subscriptions: 12,
    windows: 84,
  });
  const first = await snapshot();
  assert.equal(first.clinics.length, 10);
  assert.equal(first.patients.length, 12);
  assert.equal(first.clinics.flatMap((clinic) => clinic.exams).length, 100);
  assert.equal(first.clinics.flatMap((clinic) => clinic.hours).length, 70);
  assert.equal(
    first.clinics.flatMap((clinic) =>
      clinic.exams.flatMap((exam) => exam.steps),
    ).length,
    300,
  );
  assert.equal(
    first.patients.flatMap((patient) =>
      patient.subscriptions.flatMap((subscription) => subscription.windows),
    ).length,
    84,
  );
  await seedDemo(prisma);
  assert.deepEqual(await snapshot(), first);
});

test('clínicas reais do manifesto, dois alvos de OAuth e exames usam catálogo/questionário canônicos', async () => {
  const clinics = await prisma.clinic.findMany({
    where: clinicWhere,
    include: { calendarConnection: true, exams: true },
  });
  assert.equal(clinics.filter((clinic) => clinic.demoCalendarTarget).length, 2);
  for (const clinic of clinics) {
    const source = readClinics().find((item) => item.cnes === clinic.cnes)!;
    assert.equal(clinic.address, source.address);
    assert.equal(clinic.latitude, source.latitude);
    assert.equal(clinic.longitude, source.longitude);
    assert.equal(clinic.calendarConnection, null);
    assert.equal(clinic.exams.length, protocols.length);
    for (const exam of clinic.exams) {
      const catalog = allowedExams.find(
        (item) => item.tussCode === exam.tussCode,
      )!;
      assert.ok(catalog);
      assert.equal(exam.questionnaireKey, catalog.questionnaireKey);
      const questionnaire = examQuestionnairesSeed.find(
        (item) => item.key === catalog.questionnaireKey,
      )!;
      assert.equal(exam.questionnaireVersion, questionnaire.version);
      assert.equal(
        exam.preparationCondition,
        questionnaire.preparation.condition,
      );
      assert.equal(
        exam.preparationHours,
        questionnaire.preparation.hoursBefore,
      );
      assert.deepEqual(
        exam.contraindications,
        questionnaire.contraindications.map((item) => item.id),
      );
      assert.ok(
        exam.floorPriceCents > 0 && exam.floorPriceCents <= exam.fullPriceCents,
      );
      if (exam.tussCode === '41101316') {
        assert.equal(exam.fullPriceCents, 72000);
        assert.equal(exam.floorPriceCents, 50000);
      }
    }
  }
});

test('12 pacientes com consentimento e canais são candidatos reais à RM de joelho em ordem de inscrição', async () => {
  const clock = await prisma.demoClock.findUnique({ where: { id: 1 } });
  const now = new Date(Date.now() + (clock?.offsetMinutes ?? 0) * 60000);
  const startsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 15),
  );
  const exam = await prisma.exam.findFirstOrThrow({
    where: { tussCode: '41101316', clinic: clinicWhere },
  });
  const slot = await prisma.slot.create({
    data: {
      clinicId: exam.clinicId,
      examId: exam.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60000),
      origin: 'manual',
    },
  });
  try {
    const vacancy = await prisma.vacancy.create({
      data: { slotId: slot.id, origin: 'vazio', currentPriceCents: 72000 },
    });
    const candidates = await new MatchingService(prisma).candidatos(
      vacancy.id,
      now,
    );
    const patients = await prisma.patient.findMany({
      where: patientWhere,
      include: { user: true, subscriptions: true },
    });
    assert.equal(patients.length, 12);
    const ordered = patients.sort(
      (a, b) =>
        Number(a.user.email.split('-')[1]?.split('@')[0]) -
        Number(b.user.email.split('-')[1]?.split('@')[0]),
    );
    const ids = new Set(patients.map((patient) => patient.id));
    assert.deepEqual(
      candidates
        .filter((candidate) => ids.has(candidate.patientId))
        .map((candidate) => candidate.patientId),
      ordered.map((patient) => patient.id),
    );
    for (const patient of patients) {
      assert.ok(patient.healthDataConsentAt);
      assert.ok(patient.phoneVerifiedAt);
      assert.deepEqual(patient.alertChannels, ['email', 'whatsapp']);
      const subscription = patient.subscriptions[0]!;
      assert.equal(subscription.tussCode, '41101316');
      assert.ok(subscription.expiresAt.getTime() > now.getTime());
      assert.ok(
        subscription.expiresAt.getTime() <= now.getTime() + 30 * 86400000,
      );
    }
  } finally {
    await prisma.vacancy.deleteMany({ where: { slotId: slot.id } });
    await prisma.slot.delete({ where: { id: slot.id } });
  }
});

test('conflito de identidade aborta a transação inteira sem sobrescrever dados', async () => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'patient-0@hack15.demo.invalid' },
  });
  const clinic = await prisma.clinic.findFirstOrThrow({ where: clinicWhere });
  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'clinica' },
  });
  await prisma.clinic.update({
    where: { id: clinic.id },
    data: { address: 'SENTINELA DE ROLLBACK' },
  });
  try {
    await assert.rejects(seedDemo(prisma), /Conflito de identidade/);
    assert.equal(
      (await prisma.clinic.findUniqueOrThrow({ where: { id: clinic.id } }))
        .address,
      'SENTINELA DE ROLLBACK',
    );
  } finally {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: user.role },
    });
    await prisma.clinic.update({
      where: { id: clinic.id },
      data: { address: clinic.address },
    });
  }
});

test('seed recusa produção, execução sem opt-in e banco remoto', () => {
  const env = {
    NODE_ENV: 'test',
    DEMO_SEED_ENABLED: 'true',
    DATABASE_URL: 'postgresql://localhost/hack_15',
  };
  assert.doesNotThrow(() => validateSeedEnvironment(env));
  assert.throws(() =>
    validateSeedEnvironment({ ...env, NODE_ENV: 'production' }),
  );
  assert.throws(() =>
    validateSeedEnvironment({ ...env, DEMO_SEED_ENABLED: 'false' }),
  );
  assert.throws(() =>
    validateSeedEnvironment({
      ...env,
      DATABASE_URL: 'postgresql://remote.example/hack_15',
    }),
  );
});
