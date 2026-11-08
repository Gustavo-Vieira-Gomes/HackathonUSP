import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import {
  startTestApp,
  jsonRequest,
  signUpWithCookie,
  type TestApp,
} from '../../testing/test-app';
import { PatientRetentionJob } from './patient-retention.job';

let t: TestApp;
before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.prisma.subscription.deleteMany({
    where: { patient: { user: { email: { endsWith: suffix } } } },
  });
  await t.close();
});
let suffix = '.unused';

test('consentimento ausente, falso ou inválido responde 422 sem criar conta, perfil ou sessão', async () => {
  for (const consent of [undefined, false, 'true']) {
    const email = t.email();
    const response = await jsonRequest(t, 'POST', '/api/sign-up/paciente', {
      name: 'Maria',
      email,
      password: 'senha-forte-1',
      phone: '+5511999990000',
      ...(consent === undefined ? {} : { healthDataConsent: consent }),
    });
    assert.equal(response.status, 422);
    assert.equal(
      ((await response.json()) as { message: string }).message,
      'consentimento obrigatório',
    );
    assert.equal(await t.prisma.user.count({ where: { email } }), 0);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
});

test('cadastro persiste telefone, papel e instante do aceite; login real reabre sessão', async () => {
  const before = Date.now();
  const maria = await signUpWithCookie(t, 'paciente');
  const patient = await t.prisma.patient.findUniqueOrThrow({
    where: { userId: maria.id },
    include: { user: true },
  });
  assert.equal(patient.phone, '+5511999990000');
  assert.equal(patient.user.role, 'paciente');
  assert.ok(patient.healthDataConsentAt.getTime() >= before);
  assert.ok(patient.healthDataConsentAt.getTime() <= Date.now());
  const login = await jsonRequest(t, 'POST', '/api/auth/sign-in/email', {
    email: maria.email,
    password: maria.password,
  });
  assert.equal(login.status, 200);
  assert.ok(
    login.headers.getSetCookie().some((cookie) => cookie.includes('HttpOnly')),
  );
});

test('inscrição só revela payload mínimo ao dono; terceiros, clínica e id inválido recebem 404', async () => {
  const maria = await signUpWithCookie(t, 'paciente');
  const joao = await signUpWithCookie(t, 'paciente');
  const clinic = await signUpWithCookie(t, 'clinica');
  suffix = joao.email.slice(joao.email.indexOf('.'));
  const patient = await t.prisma.patient.findUniqueOrThrow({
    where: { userId: joao.id },
  });
  const subscription = await t.prisma.subscription.create({
    data: {
      patientId: patient.id,
      tussCode: '40901122',
      maxPriceCents: 25000,
      latitude: -23.5,
      longitude: -46.7,
      radiusMeters: 5000,
      expiresAt: new Date(),
    },
  });
  const path = `/api/patient/subscriptions/${subscription.id}`;
  assert.equal((await jsonRequest(t, 'GET', path)).status, 401);
  const own = await jsonRequest(t, 'GET', path, undefined, {
    cookie: joao.cookie,
  });
  assert.equal(own.status, 200);
  const payload = await own.json();
  assert.ok(payload && typeof payload === 'object');
  assert.deepEqual(Object.keys(payload).sort(), [
    'expiresAt',
    'id',
    'maxPriceCents',
    'tussCode',
  ]);
  for (const cookie of [maria.cookie, clinic.cookie]) {
    const other = await jsonRequest(t, 'GET', path, undefined, { cookie });
    const missing = await jsonRequest(
      t,
      'GET',
      `/api/patient/subscriptions/${randomUUID()}`,
      undefined,
      { cookie },
    );
    assert.equal(other.status, 404);
    assert.deepEqual(await other.json(), await missing.json());
  }
  assert.equal(
    (
      await jsonRequest(
        t,
        'GET',
        '/api/patient/subscriptions/invalid',
        undefined,
        { cookie: joao.cookie },
      )
    ).status,
    404,
  );
});

test('retenção exclui no limite de 30 dias e janelas; preserva dados recentes e permite reexecução', async () => {
  const maria = await signUpWithCookie(t, 'paciente');
  const patient = await t.prisma.patient.findUniqueOrThrow({
    where: { userId: maria.id },
  });
  const now = new Date('2001-02-01T00:00:00Z');
  const cutoff = now.getTime() - 30 * 86400000;
  const ids: string[] = [];
  for (const delta of [-1, 0, 1]) {
    const row = await t.prisma.subscription.create({
      data: {
        patientId: patient.id,
        tussCode: String(delta),
        maxPriceCents: 100,
        latitude: 0,
        longitude: 0,
        radiusMeters: 1,
        expiresAt: new Date(cutoff + delta),
        windows: { create: { weekday: 1, startMinute: 600, endMinute: 660 } },
      },
    });
    ids.push(row.id);
  }
  const job = t.app.get(PatientRetentionJob);
  assert.equal(await job.run(now), 2);
  assert.equal(
    await t.prisma.subscription.count({ where: { id: { in: ids } } }),
    1,
  );
  assert.equal(
    await t.prisma.subscriptionWindow.count({
      where: { subscriptionId: { in: ids } },
    }),
    1,
  );
  assert.equal(await job.run(now), 0);
  assert.ok(await t.prisma.patient.findUnique({ where: { id: patient.id } }));
  await t.prisma.subscription.deleteMany({ where: { id: { in: ids } } });
});

test('falha ao persistir perfil reverte User, Account e Session', async () => {
  const email = t.email();
  await t.prisma.$executeRawUnsafe(
    `ALTER TABLE "Patient" ADD CONSTRAINT "hack23_test_profile_failure" CHECK (phone <> '+5511888880000') NOT VALID`,
  );
  try {
    const response = await jsonRequest(t, 'POST', '/api/sign-up/paciente', {
      name: 'Rollback',
      email,
      password: 'senha-forte-1',
      phone: '+5511888880000',
      healthDataConsent: true,
    });
    assert.equal(response.status, 500);
    assert.equal(await t.prisma.user.count({ where: { email } }), 0);
    assert.equal(response.headers.getSetCookie().length, 0);
    assert.equal(
      await t.prisma.account.count({ where: { user: { email } } }),
      0,
    );
    assert.equal(
      await t.prisma.session.count({ where: { user: { email } } }),
      0,
    );
  } finally {
    await t.prisma.$executeRawUnsafe(
      'ALTER TABLE "Patient" DROP CONSTRAINT "hack23_test_profile_failure"',
    );
  }
});
