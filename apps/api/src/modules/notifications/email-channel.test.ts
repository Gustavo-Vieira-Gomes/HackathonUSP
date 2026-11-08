import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../app';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { createSchemaFixtures, examData } from '../../testing/schema-fixtures';
import { startFakeResend } from './email/fake-resend.test-helper';
import { NotificationsService } from './notifications.service';

/**
 * Critério do HACK-36 de ponta a ponta, menos o Resend real: app montada com o
 * e-mail configurado, `enviar` despacha pelo adapter, o `Alert` fica `enviado` e o
 * e-mail leva o link da vaga. O fornecedor é o servidor falso local.
 */

let fake: Awaited<ReturnType<typeof startFakeResend>>;
let withEmail: INestApplication;
let withoutEmail: INestApplication;
let fixtures: ReturnType<typeof createSchemaFixtures>;
let prisma: PrismaService;

before(async () => {
  fake = await startFakeResend();
  withEmail = await createApp({
    logger: false,
    env: loadEnv({
      ...process.env,
      RESEND_API_KEY: 're_test_chave_local',
      RESEND_API_URL: fake.url,
      EMAIL_FROM: 'Vagas <alertas@exemplo.com>',
    }),
  });
  withoutEmail = await createApp({
    logger: false,
    env: loadEnv({ ...process.env, RESEND_API_KEY: '', EMAIL_FROM: '' }),
  });
  prisma = withEmail.get(PrismaService);
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
  await withEmail.close();
  await withoutEmail.close();
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
    data: { alertChannels: ['email'] },
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
    url: `https://app.example/vagas/${vacancy.id}`,
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

test('vaga publicada → e-mail sai pelo Resend com o link da vaga e o Alert fica enviado', async () => {
  fake.reset();
  const { patientId, email, context, url } = await scenario();
  const outcome = await withEmail
    .get(NotificationsService)
    .enviar(patientId, message(url), context);
  assert.deepEqual(outcome, [{ channel: 'email', result: 'enviado' }]);
  assert.equal(fake.calls.length, 1);
  const [call] = fake.calls;
  assert.ok(call);
  assert.deepEqual(call.body.to, [email]);
  assert.equal(call.body.subject, 'Vaga de RM de joelho');
  assert.ok(call.body.text.includes(url));
  assert.ok(call.body.html.includes(`href="${url}"`));
  const alert = await prisma.alert.findFirstOrThrow({
    where: { vacancyId: context.vacancyId, channel: 'email' },
  });
  assert.equal(alert.result, 'enviado');
  assert.equal(call.headers['idempotency-key'], `alert-${alert.id}`);
});

test('Resend fora duas vezes → Alert de e-mail fica falhou', async () => {
  fake.reset();
  fake.reply({ status: 503 }, { status: 503 });
  const { patientId, context, url } = await scenario();
  const outcome = await withEmail
    .get(NotificationsService)
    .enviar(patientId, message(url), context);
  assert.deepEqual(outcome, [{ channel: 'email', result: 'falhou' }]);
  assert.equal(fake.calls.length, 2);
});

test('sem RESEND_API_KEY o canal de e-mail não envia e o Alert fica sem_canal', async () => {
  fake.reset();
  const { patientId, context, url } = await scenario();
  const outcome = await withoutEmail
    .get(NotificationsService)
    .enviar(patientId, message(url), context);
  assert.deepEqual(outcome, [{ channel: 'email', result: 'sem_canal' }]);
  assert.equal(fake.calls.length, 0);
  const alert = await prisma.alert.findFirstOrThrow({
    where: { vacancyId: context.vacancyId, channel: 'email' },
  });
  assert.equal(alert.result, 'sem_canal');
});
