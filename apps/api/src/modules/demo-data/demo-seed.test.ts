import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { Module } from '@nestjs/common';
import { createAppFromModule } from '../../app';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClinicsModule } from '../clinics/clinics.module';
import {
  clinicsResponseSchema,
  examQuestionnaireSchema,
} from '@hackathon/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { loadEnv } from '../../config/env';
import { startTestApp, type TestApp } from '../../testing/test-app';
import { MatchingService } from '../vacancies/matching.service';
import { examQuestionnairesSeed } from '../exams/exam-questionnaires.seed';
import { demoId, readClinics, seedDemo } from './demo-seed';

const execute = promisify(execFile);
const env = { ...process.env, NODE_ENV: 'test', DEMO_SEED_ENABLED: 'true' };
const cli = (override: NodeJS.ProcessEnv = {}) =>
  execute('npm', ['run', 'seed'], {
    cwd: '../..',
    env: { ...env, ...override },
    timeout: 120000,
  });
const clinicIds = Array.from({ length: 10 }, (_, i) => demoId('clinic', i));
const patientIds = Array.from({ length: 12 }, (_, i) => demoId('patient', i));
const expectedProtocols = [
  ['40901130', 'us-abdomen'],
  ['40901181', 'us-pelvis-transabdominal'],
  ['40901203', 'us-thyroid'],
  ['40901114', 'us-breast'],
  ['40901220', 'us-musculoskeletal'],
  ['40901106', 'echo-transthoracic'],
  ['40808041', 'mammography'],
  ['41001010', 'ct-without-contrast'],
  ['41001079', 'ct-without-contrast'],
  ['41101316', 'mri-without-contrast'],
] as const;
let prisma: PrismaService;
let app: TestApp;
before(async () => {
  prisma = new PrismaService(loadEnv());
  await cli();
  app = await startTestApp();
});
after(async () => {
  await app?.close();
  await prisma?.$disconnect();
});
async function identitySnapshot() {
  return {
    clinics: await prisma.clinic.findMany({
      where: { id: { in: clinicIds } },
      orderBy: { id: 'asc' },
      select: { id: true, createdAt: true },
    }),
    exams: await prisma.exam.findMany({
      where: { clinicId: { in: clinicIds } },
      orderBy: { id: 'asc' },
      select: { id: true, createdAt: true },
    }),
    steps: await prisma.priceStep.findMany({
      where: { exam: { clinicId: { in: clinicIds } } },
      orderBy: { id: 'asc' },
    }),
    patients: await prisma.patient.findMany({
      where: { id: { in: patientIds } },
      orderBy: { id: 'asc' },
      select: { id: true, createdAt: true },
    }),
    subscriptions: await prisma.subscription.findMany({
      where: { patientId: { in: patientIds } },
      orderBy: { id: 'asc' },
      select: { id: true, createdAt: true },
    }),
    windows: await prisma.subscriptionWindow.findMany({
      where: { subscription: { patientId: { in: patientIds } } },
      orderBy: { id: 'asc' },
    }),
    hours: await prisma.clinicOpeningHours.findMany({
      where: { clinicId: { in: clinicIds } },
      orderBy: { id: 'asc' },
    }),
  };
}
test('H15 C1 CLI idempotente', async () => {
  const first = await identitySnapshot();
  await cli();
  const second = await identitySnapshot();
  assert.deepEqual(second, first);
  assert.deepEqual(
    Object.values(first).map((rows) => rows.length),
    [10, 100, 300, 12, 12, 84, 70],
  );
});
test('H15 C2 manifesto verificavel', () => {
  const clinics = readClinics();
  assert.equal(clinics.length, 10);
  assert.equal(new Set(clinics.map((c) => c.cnes)).size, 10);
  for (const c of clinics) {
    assert.match(c.address, /S[aã]o Paulo|SP/);
    assert.ok(c.latitude < -23 && c.latitude > -24);
    assert.ok(c.longitude < -46 && c.longitude > -47);
    assert.ok(c.sources.every((s) => new URL(s).protocol === 'https:'));
    assert.match(c.verifiedAt, /^2026-11-08$/);
    assert.ok(c.technicalManager.length > 10);
  }
});
test('H15 C3 agenda futura', async () => {
  assert.equal(
    await prisma.clinic.count({
      where: { id: { in: clinicIds }, demoCalendarTarget: true },
    }),
    2,
  );
  assert.equal(
    await prisma.clinic.count({
      where: { id: { in: clinicIds }, demoCalendarTarget: false },
    }),
    8,
  );
  const ids = Array.from({ length: 10 }, (_, i) => demoId('clinic-user', i));
  assert.equal(
    await prisma.account.count({ where: { userId: { in: ids } } }),
    0,
  );
  assert.equal(
    await prisma.session.count({ where: { userId: { in: ids } } }),
    0,
  );
});
test('H15 C4 precos e protocolos', async () => {
  const exams = await prisma.exam.findMany({
    where: { clinicId: { in: clinicIds } },
    include: { priceSteps: { orderBy: { leadMinutes: 'desc' } } },
  });
  assert.equal(exams.length, 100);
  for (const id of clinicIds)
    assert.deepEqual(
      exams
        .filter((e) => e.clinicId === id)
        .map((e) => e.tussCode)
        .sort(),
      expectedProtocols.map((p) => p[0]).sort(),
    );
  for (const e of exams) {
    assert.ok(e.floorPriceCents <= e.fullPriceCents && e.floorPriceCents > 0);
    assert.deepEqual(
      e.priceSteps.map((s) => [s.leadMinutes, s.discountPercent]),
      [
        [2880, 10],
        [1440, 20],
        [360, 30],
      ],
    );
    if (e.tussCode === '41101316') {
      assert.equal(e.fullPriceCents, 72000);
      assert.equal(e.floorPriceCents, 50000);
      assert.match(e.name, /joelho.*sem contraste ou sedação/);
    }
  }
});
test('H15 C5 associacao canonica', async () => {
  const exams = await prisma.exam.findMany({
    where: { clinicId: { in: clinicIds } },
  });
  assert.equal(exams.length, 100);
  for (const e of exams) {
    const expected = examQuestionnairesSeed.find(
      (q) => q.key === expectedProtocols.find((p) => p[0] === e.tussCode)?.[1],
    );
    assert.ok(expected);
    const snapshot = examQuestionnaireSchema.parse(e.questionnaire);
    assert.deepEqual(snapshot, expected);
    assert.equal(e.questionnaireKey, expected.key);
    assert.equal(e.questionnaireVersion, expected.version);
    assert.equal(e.preparationHours, expected.preparation.hoursBefore);
    assert.equal(e.preparationCondition, expected.preparation.condition);
    assert.deepEqual(
      e.contraindications,
      expected.contraindications.map((c) => c.id),
    );
    assert.equal(snapshot.clinicalReview.status, 'pending');
  }
});
test('H15 C6 pacientes e inscricoes', async () => {
  const patients = await prisma.patient.findMany({
    where: { id: { in: patientIds } },
    include: { user: true, subscriptions: { include: { windows: true } } },
  });
  assert.equal(patients.length, 12);
  for (const p of patients) {
    assert.match(p.user.name, /FICTÍCIO/);
    assert.match(p.user.email, /\.invalid$/);
    assert.equal(p.subscriptions.length, 1);
    const s = p.subscriptions[0]!;
    assert.equal(s.tussCode, '41101316');
    assert.equal(s.maxPriceCents, 72000);
    assert.equal(s.radiusMeters, 50000);
    assert.ok(s.expiresAt > new Date());
    assert.deepEqual(
      s.windows
        .map((w) => [w.weekday, w.startMinute, w.endMinute])
        .sort((a, b) => a[0]! - b[0]!),
      Array.from({ length: 7 }, (_, i) => [i, 0, 1440]),
    );
  }
});
test('H15 C7 matching real', async () => {
  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + 1);
  startsAt.setUTCHours(17, 0, 0, 0);
  const slot = await prisma.slot.create({
    data: {
      clinicId: clinicIds[0]!,
      examId: demoId('exam', 9),
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3600000),
      origin: 'manual',
    },
  });
  const vacancy = await prisma.vacancy.create({
    data: { slotId: slot.id, origin: 'vazio', currentPriceCents: 50000 },
  });
  try {
    const matches = await new MatchingService(prisma).candidatos(
      vacancy.id,
      new Date(),
    );
    const own = matches.filter((m) => patientIds.includes(m.patientId));
    assert.equal(own.length, 12);
    assert.equal(new Set(own.map((m) => m.patientId)).size, 12);
    assert.equal(
      await prisma.alert.count({ where: { vacancyId: vacancy.id } }),
      0,
    );
  } finally {
    await prisma.vacancy.delete({ where: { id: vacancy.id } });
    await prisma.slot.delete({ where: { id: slot.id } });
  }
});
test('H15 C8 busca HTTP', async () => {
  const response = await fetch(`${app.url}/api/clinics`);
  assert.equal(response.status, 200);
  const body = clinicsResponseSchema.parse(await response.json());
  assert.equal(body.clinics.filter((c) => clinicIds.includes(c.id)).length, 10);
  const name = readClinics()[0]!.name;
  const filtered = await fetch(
    `${app.url}/api/clinics?q=${encodeURIComponent(name)}`,
  );
  const result = clinicsResponseSchema.parse(await filtered.json());
  assert.equal(result.clinics.length, 1);
  assert.equal(result.clinics[0]!.name, name);
  assert.equal(
    (await fetch(`${app.url}/api/clinics?q=${'x'.repeat(121)}`)).status,
    400,
  );
  assert.ok(!JSON.stringify(body).includes('clinicalReview'));
  assert.ok(!JSON.stringify(body).includes('patient'));
});
test('H15 C9 vazio e falha', async () => {
  const empty = await fetch(
    `${app.url}/api/clinics?q=nenhuma-clinica-${randomUUID()}`,
  );
  assert.deepEqual(await empty.json(), { clinics: [] });
  @Module({
    imports: [
      ConfigModule.forRoot({
        ...app.env,
        DATABASE_URL:
          'postgresql://manza@127.0.0.1:1/inexistente?connect_timeout=1',
      }),
      PrismaModule,
      ClinicsModule,
    ],
  })
  class UnavailableDatabaseModule {}
  const broken = await createAppFromModule(UnavailableDatabaseModule, {
    logger: false,
  });
  await broken.listen(0, '127.0.0.1');
  try {
    assert.equal(
      (await fetch(`${await broken.getUrl()}/api/clinics`)).status,
      500,
    );
  } finally {
    await broken.close();
  }
});
test('H15 C10 rollback e isolamento', async () => {
  const snapshot = await identitySnapshot();
  await Promise.all([cli(), cli()]);
  assert.deepEqual(await identitySnapshot(), snapshot);
  const sentinelId = randomUUID(),
    sentinelCnes = `${Date.now()}`.slice(-7);
  await prisma.user.create({
    data: {
      id: sentinelId,
      email: `${sentinelId}@sentinel.invalid`,
      name: 'Sentinela',
      role: 'clinica',
    },
  });
  const sentinel = await prisma.clinic.create({
    data: {
      id: randomUUID(),
      userId: sentinelId,
      name: 'Sentinela',
      address: 'Sentinela',
      latitude: -23.5,
      longitude: -46.6,
      cnes: sentinelCnes,
      technicalManager: 'Sentinela',
    },
  });
  try {
    const clinics = readClinics();
    clinics[9] = { ...clinics[9]!, cnes: sentinelCnes };
    const changed = await prisma.clinic.update({
      where: { id: clinicIds[0]! },
      data: { name: 'Preservar no rollback' },
    });
    await assert.rejects(seedDemo(prisma, clinics));
    assert.deepEqual(
      await prisma.clinic.findUnique({ where: { id: sentinel.id } }),
      sentinel,
    );
    assert.equal(
      (await prisma.clinic.findUniqueOrThrow({ where: { id: changed.id } }))
        .name,
      'Preservar no rollback',
    );
  } finally {
    await prisma.clinic.delete({ where: { id: sentinel.id } });
    await prisma.user.delete({ where: { id: sentinelId } });
    await cli();
  }
  // Falha real de banco depois de escritas iniciais: constraint inválida no último item.
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION hack15_fail_seed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${clinicIds[9]}' THEN RAISE EXCEPTION 'failure injected by H15 C10'; END IF; RETURN NEW; END $$`,
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER hack15_fail_seed BEFORE UPDATE ON "Clinic" FOR EACH ROW EXECUTE FUNCTION hack15_fail_seed()',
  );
  const first = await prisma.clinic.update({
    where: { id: clinicIds[0]! },
    data: { name: 'Persistir até rollback' },
  });
  try {
    await assert.rejects(cli());
    assert.equal(
      (await prisma.clinic.findUniqueOrThrow({ where: { id: first.id } })).name,
      'Persistir até rollback',
    );
    assert.deepEqual(await identitySnapshot(), snapshot);
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER hack15_fail_seed ON "Clinic"');
    await prisma.$executeRawUnsafe('DROP FUNCTION hack15_fail_seed()');
    await cli();
  }
});
test('H15 C11 ambiente seguro', async () => {
  await assert.rejects(cli({ NODE_ENV: 'production' }));
  await assert.rejects(cli({ NODE_ENV: '', DEMO_SEED_ENABLED: '' }));
  const ids = Array.from({ length: 12 }, (_, i) => demoId('patient-user', i));
  assert.equal(
    await prisma.account.count({ where: { userId: { in: ids } } }),
    0,
  );
  assert.equal(
    await prisma.session.count({ where: { userId: { in: ids } } }),
    0,
  );
  const patients = await prisma.patient.findMany({
    where: { id: { in: patientIds } },
  });
  for (const p of patients) {
    assert.deepEqual(p.alertChannels, []);
    assert.equal(p.phoneVerifiedAt, null);
    assert.equal(p.phone, 'DEMO-SEM-TELEFONE');
  }
});
