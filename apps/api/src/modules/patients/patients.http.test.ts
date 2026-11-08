import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ClockService } from '../clock/clock.service';
import { PatientRetentionJob } from './patient-retention.job';
import { examData, subscriptionData } from '../../testing/schema-fixtures';
import {
  jsonRequest,
  sessionCookie,
  startTestApp,
  signUpWithCookie,
  type TestApp,
} from '../../testing/test-app';

let t: TestApp;
before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.close();
});

test('HACK-23: consentimento obrigatório não cria conta; aceite grava perfil e sessão', async () => {
  const email = t.email();
  const body = {
    name: 'Maria',
    email,
    password: 'senha-forte-1',
    phone: '+5511999999999',
  };
  const rejected = await jsonRequest(t, 'POST', '/api/sign-up/paciente', body);
  assert.equal(rejected.status, 422);
  assert.equal(
    ((await rejected.json()) as { message: string }).message,
    'consentimento obrigatório',
  );
  assert.equal(await t.prisma.user.count({ where: { email } }), 0);
  const clock = t.app.get(ClockService);
  const originalNow = clock.now.bind(clock);
  const consentAt = new Date('2030-01-01T12:00:00.000Z');
  clock.now = () => consentAt;
  const accepted = await jsonRequest(t, 'POST', '/api/sign-up/paciente', {
    ...body,
    healthDataConsent: true,
  });
  assert.equal(accepted.status, 200, await accepted.clone().text());
  assert.ok(sessionCookie(accepted));
  const patient = await t.prisma.patient.findFirstOrThrow({
    where: { user: { email } },
  });
  assert.equal(patient.phone, body.phone);
  assert.equal(
    patient.healthDataConsentAt.toISOString(),
    consentAt.toISOString(),
  );
  clock.now = originalNow;
});

test('HACK-23: outro paciente e id inválido respondem 404 sem campos privados', async () => {
  const response = await jsonRequest(t, 'POST', '/api/sign-up/paciente', {
    name: 'Maria',
    email: t.email(),
    password: 'senha-forte-1',
    phone: '+5511988888888',
    healthDataConsent: true,
  });
  const cookie = sessionCookie(response);
  for (const resource of ['reservations', 'subscriptions']) {
    for (const id of ['00000000-0000-4000-8000-000000000001', 'invalid']) {
      const result = await jsonRequest(
        t,
        'GET',
        `/api/patient/${resource}/${id}`,
        undefined,
        { cookie },
      );
      assert.equal(result.status, 404);
      assert.equal(
        ((await result.json()) as { code: string }).code,
        'NOT_FOUND',
      );
    }
  }
});

test('HACK-23: reserva/inscrição de João só João lê; Maria não recebe dado algum', async () => {
  const clinic = await signUpWithCookie(t, 'clinica');
  const joao = await signUpWithCookie(t, 'paciente');
  const maria = await signUpWithCookie(t, 'paciente');
  const patient = await t.prisma.patient.findUniqueOrThrow({
    where: { userId: joao.id },
  });
  const exam = await t.prisma.exam.create({ data: examData(clinic.clinicId!) });
  const startsAt = new Date(Date.now() + 86400000);
  const slot = await t.prisma.slot.create({
    data: {
      clinicId: clinic.clinicId!,
      examId: exam.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3600000),
      origin: 'manual',
    },
  });
  const reservation = await t.prisma.reservation.create({
    data: {
      patientId: patient.id,
      slotId: slot.id,
      type: 'comum',
      state: 'confirmada',
      chargedPriceCents: 30000,
      depositCents: 0,
      paymentMethod: 'no_local',
    },
  });
  const subscription = await t.prisma.subscription.create({
    data: subscriptionData(patient.id),
  });
  try {
    for (const [resource, id] of [
      ['reservations', reservation.id],
      ['subscriptions', subscription.id],
    ]) {
      const own = await jsonRequest(
        t,
        'GET',
        `/api/patient/${resource}/${id}`,
        undefined,
        { cookie: joao.cookie },
      );
      assert.equal(own.status, 200);
      assert.equal(((await own.json()) as { id: string }).id, id);
      const other = await jsonRequest(
        t,
        'GET',
        `/api/patient/${resource}/${id}`,
        undefined,
        { cookie: maria.cookie },
      );
      assert.equal(other.status, 404);
      assert.deepEqual(await other.json(), {
        code: 'NOT_FOUND',
        message:
          resource === 'reservations'
            ? 'Reserva não encontrada.'
            : 'Inscrição não encontrada.',
      });
      assert.equal(
        (await jsonRequest(t, 'GET', `/api/patient/${resource}/${id}`)).status,
        401,
      );
      assert.equal(
        (
          await jsonRequest(
            t,
            'GET',
            `/api/patient/${resource}/${id}`,
            undefined,
            { cookie: clinic.cookie },
          )
        ).status,
        403,
      );
    }
  } finally {
    await t.prisma.reservation.delete({ where: { id: reservation.id } });
    await t.prisma.subscription.delete({ where: { id: subscription.id } });
    await t.prisma.slot.delete({ where: { id: slot.id } });
    await t.prisma.exam.delete({ where: { id: exam.id } });
  }
});

test('HACK-23: retenção apaga na fronteira de 30 dias e dependentes, preserva dados recentes', async () => {
  const clinic = await signUpWithCookie(t, 'clinica');
  const account = await signUpWithCookie(t, 'paciente');
  const patient = await t.prisma.patient.findUniqueOrThrow({
    where: { userId: account.id },
  });
  const exam = await t.prisma.exam.create({ data: examData(clinic.clinicId!) });
  const now = new Date('2031-01-31T12:00:00.000Z');
  const cutoff = new Date(now.getTime() - 30 * 86400000);
  const slot = await t.prisma.slot.create({
    data: {
      clinicId: clinic.clinicId!,
      examId: exam.id,
      startsAt: new Date(cutoff.getTime() - 3600000),
      endsAt: cutoff,
      origin: 'manual',
    },
  });
  const vacancy = await t.prisma.vacancy.create({
    data: {
      slotId: slot.id,
      origin: 'vazio',
      state: 'expirada',
      currentPriceCents: 30000,
    },
  });
  const reservation = await t.prisma.reservation.create({
    data: {
      patientId: patient.id,
      slotId: slot.id,
      type: 'comum',
      state: 'realizada',
      chargedPriceCents: 30000,
      depositCents: 0,
      paymentMethod: 'no_local',
    },
  });
  const transition = await t.prisma.transition.create({
    data: {
      reservationId: reservation.id,
      toState: 'realizada',
      origin: 'clinica',
      reason: 'Exame realizado',
    },
  });
  const subscription = await t.prisma.subscription.create({
    data: {
      ...subscriptionData(patient.id),
      expiresAt: cutoff,
      windows: { create: { weekday: 1, startMinute: 480, endMinute: 600 } },
    },
  });
  const recent = await t.prisma.subscription.create({
    data: {
      ...subscriptionData(patient.id, '40901123'),
      expiresAt: new Date(cutoff.getTime() + 1),
    },
  });
  const alert = await t.prisma.alert.create({
    data: {
      vacancyId: vacancy.id,
      subscriptionId: subscription.id,
      wave: 1,
      channel: 'whatsapp',
      result: 'enviado',
    },
  });
  await t.prisma.simulatedWhatsappMessage.create({
    data: {
      patientId: patient.id,
      phone: patient.phone,
      body: 'Exame',
      kind: 'alerta',
      alertId: alert.id,
    },
  });
  const clock = t.app.get(ClockService);
  const originalNow = clock.now.bind(clock);
  clock.now = () => now;
  try {
    await t.app.get(PatientRetentionJob).run();
    assert.equal(
      await t.prisma.reservation.count({ where: { id: reservation.id } }),
      0,
    );
    assert.equal(
      await t.prisma.transition.count({ where: { id: transition.id } }),
      0,
    );
    assert.equal(
      await t.prisma.subscription.count({ where: { id: subscription.id } }),
      0,
    );
    assert.equal(
      await t.prisma.subscriptionWindow.count({
        where: { subscriptionId: subscription.id },
      }),
      0,
    );
    assert.equal(await t.prisma.alert.count({ where: { id: alert.id } }), 0);
    assert.equal(
      await t.prisma.simulatedWhatsappMessage.count({
        where: { alertId: alert.id },
      }),
      0,
    );
    assert.equal(
      await t.prisma.subscription.count({ where: { id: recent.id } }),
      1,
    );
    await t.app.get(PatientRetentionJob).run(); // idempotente
  } finally {
    clock.now = originalNow;
    await t.prisma.transition.deleteMany({
      where: { reservationId: reservation.id },
    });
    await t.prisma.reservation.deleteMany({ where: { id: reservation.id } });
    await t.prisma.simulatedWhatsappMessage.deleteMany({
      where: { patientId: patient.id },
    });
    await t.prisma.alert.deleteMany({ where: { vacancyId: vacancy.id } });
    await t.prisma.subscription.deleteMany({
      where: { patientId: patient.id },
    });
    await t.prisma.vacancy.delete({ where: { id: vacancy.id } });
    await t.prisma.slot.delete({ where: { id: slot.id } });
    await t.prisma.exam.delete({ where: { id: exam.id } });
  }
});
