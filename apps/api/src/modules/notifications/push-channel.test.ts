import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import webpush from 'web-push';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../app';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { createSchemaFixtures, examData } from '../../testing/schema-fixtures';
import { startFakeResend } from './email/fake-resend.test-helper';
const vapid = webpush.generateVAPIDKeys();
import { NotificationsService } from './notifications.service';

let fake: Awaited<ReturnType<typeof startFakeResend>>;
let withPush: INestApplication;
let withoutPush: INestApplication;
let fixtures: ReturnType<typeof createSchemaFixtures>;
let prisma: PrismaService;

before(async () => {
  fake = await startFakeResend();
  withPush = await createApp({
    logger: false,
    env: loadEnv({
      ...process.env,
      RESEND_API_KEY: 're_test_chave_local',
      RESEND_API_URL: fake.url,
      EMAIL_FROM: 'Vagas <alertas@exemplo.com>',
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: 'mailto:dev@example.com',
    }),
  });
  withoutPush = await createApp({
    logger: false,
    env: loadEnv({
      ...process.env,
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
      VAPID_SUBJECT: '',
      RESEND_API_KEY: 're_test_chave_local',
      RESEND_API_URL: fake.url,
      EMAIL_FROM: 'Vagas <alertas@exemplo.com>',
    }),
  });
  prisma = withPush.get(PrismaService);
  fixtures = createSchemaFixtures(prisma);
});

after(async () => {
  const ownClinic = { clinic: { userId: { in: fixtures.userIds } } };
  await prisma.alert.deleteMany({ where: { vacancy: { slot: ownClinic } } });
  await prisma.subscription.deleteMany({
    where: { patient: { userId: { in: fixtures.userIds } } },
  });
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
  await withPush.close();
  await withoutPush.close();
  await fake.close();
});

let seq = 0;

async function scenario() {
  const clinic = await fixtures.createClinic();
  const exam = await prisma.exam.create({
    data: examData(clinic.id, {
      tussCode: `5${String(++seq).padStart(7, '0')}`,
    }),
  });
  const patient = await fixtures.createPatient();
  await prisma.patient.update({
    where: { id: patient.id },
    data: { alertChannels: ['push', 'email'] },
  });
  const startsAt = new Date('2027-01-16T13:00:00Z');
  const slot = await prisma.slot.create({
    data: {
      clinicId: clinic.id,
      examId: exam.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      origin: 'manual',
    },
  });
  const vacancy = await prisma.vacancy.create({
    data: { slotId: slot.id, origin: 'vazio', currentPriceCents: 25000 },
  });
  const subscription = await prisma.subscription.create({
    data: {
      patientId: patient.id,
      tussCode: exam.tussCode,
      maxPriceCents: 30000,
      latitude: clinic.latitude,
      longitude: clinic.longitude,
      radiusMeters: 5000,
      expiresAt: new Date('2027-12-31T00:00:00Z'),
    },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: patient.userId },
  });
  return {
    patientId: patient.id,
    email: user.email,
    context: {
      vacancyId: vacancy.id,
      subscriptionId: subscription.id,
      wave: 1,
    },
    url: `http://localhost:3000/paciente/vagas/${vacancy.id}`,
  };
}

const message = (url: string) => ({
  clinicName: 'Clínica Teste',
  examName: 'RM de joelho',
  startsAt: new Date('2027-01-16T13:00:00Z'),
  priceCents: 57600,
  distanceMeters: 2100,
  preparation: null,
  vacancyUrl: url,
});

test('núcleo da vaga entrega push pelo web-push falso e grava Alert enviado junto com e-mail', async (t) => {
  const calls: unknown[][] = [];
  t.mock.method(webpush, 'sendNotification', async (...args: unknown[]) => {
    calls.push(args);
    return { statusCode: 201, headers: {}, body: '' };
  });
  const { patientId, context, url } = await scenario();
  await prisma.pushSubscription.create({
    data: {
      patientId,
      endpoint: `https://fcm.googleapis.com/send/${patientId}`,
      p256dh: 'A'.repeat(87),
      auth: 'B'.repeat(22),
    },
  });
  const result = await withPush
    .get(NotificationsService)
    .enviar(patientId, message(url), context);
  assert.deepEqual(result, [
    { channel: 'push', result: 'enviado' },
    { channel: 'email', result: 'enviado' },
  ]);
  const alert = await prisma.alert.findFirstOrThrow({
    where: { vacancyId: context.vacancyId, channel: 'push' },
  });
  assert.equal(alert.result, 'enviado');
  assert.equal(calls.length, 1);
  assert.ok(calls[0]);
  const payload = JSON.parse(String(calls[0][1])) as {
    url: string;
    tag: string;
    body: string;
  };
  assert.equal(payload.url, url);
  assert.equal(payload.tag, alert.id);
  assert.ok(payload.body.includes('Clínica Teste'));
  assert.ok(payload.body.includes('RM de joelho'));
});

test('sem permissão/subscription ou sem VAPID grava sem_canal e mantém e-mail', async () => {
  for (const app of [withPush, withoutPush]) {
    const { patientId, context, url } = await scenario();
    const result = await app
      .get(NotificationsService)
      .enviar(patientId, message(url), context);
    assert.deepEqual(result, [
      { channel: 'push', result: 'sem_canal' },
      { channel: 'email', result: 'enviado' },
    ]);
    const alert = await prisma.alert.findFirstOrThrow({
      where: { vacancyId: context.vacancyId, channel: 'push' },
    });
    assert.equal(alert.result, 'sem_canal');
    assert.equal(alert.sentAt, null);
  }
});
