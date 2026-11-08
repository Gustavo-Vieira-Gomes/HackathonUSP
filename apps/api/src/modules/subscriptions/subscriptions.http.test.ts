import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  subscriptionResultSchema,
  subscriptionListSchema,
} from '@hackathon/contracts';
import { ClockService } from '../clock/clock.service';
import { EmailService } from '../notifications/email/email.service';
import { SubscriptionExpiryJob } from './subscription-expiry.job';
import { examData } from '../../testing/schema-fixtures';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';

let t: TestApp;
let cookie: string;
let otherCookie: string;
let subscriptionId: string;
let vacancyId: string;
let clinicId: string;
const now = new Date('2030-01-01T12:00:00Z');
const body = {
  tussCode: '41101316',
  latitude: -23.5614,
  longitude: -46.7307,
  radiusMeters: 10000,
  maxPriceCents: 55000,
  canGoToday: false,
  windows: [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinute: 1080,
    endMinute: 1260,
  })),
};
before(async () => {
  t = await startTestApp();
  const patient = await signUpWithCookie(t, 'paciente');
  cookie = patient.cookie;
  otherCookie = (await signUpWithCookie(t, 'paciente')).cookie;
  const clinic = await signUpWithCookie(t, 'clinica');
  clinicId = clinic.clinicId!;
  await t.prisma.clinic.update({
    where: { id: clinicId },
    data: { latitude: body.latitude, longitude: body.longitude },
  });
  t.app.get(ClockService).now = () => now;
  const exam = await t.prisma.exam.create({
    data: examData(clinicId, { tussCode: body.tussCode, preparationHours: 0 }),
  });
  const slot = await t.prisma.slot.create({
    data: {
      clinicId,
      examId: exam.id,
      startsAt: new Date('2030-01-05T13:00:00Z'),
      endsAt: new Date('2030-01-05T13:30:00Z'),
      origin: 'manual',
    },
  });
  vacancyId = (
    await t.prisma.vacancy.create({
      data: {
        slotId: slot.id,
        origin: 'vazio',
        currentPriceCents: 54000,
      },
    })
  ).id;
});
after(async () => {
  if (!t) return;
  if (subscriptionId)
    await t.prisma.subscription.deleteMany({ where: { id: subscriptionId } });
  if (vacancyId)
    await t.prisma.vacancy.deleteMany({ where: { id: vacancyId } });
  if (clinicId) {
    await t.prisma.slot.deleteMany({ where: { clinicId } });
    await t.prisma.exam.deleteMany({ where: { clinicId } });
  }
  await t.close();
});

test('HACK-24: autenticação e validação no servidor', async () => {
  assert.equal(
    (await jsonRequest(t, 'POST', '/api/patient/subscriptions', body)).status,
    401,
  );
  for (const invalid of [
    { ...body, windows: [] },
    { ...body, windows: [{ weekday: 1, startMinute: 1000, endMinute: 900 }] },
    { ...body, canGoToday: true },
    { ...body, patientId: 'outro' },
    { ...body, tussCode: '00000000' },
  ]) {
    assert.equal(
      (
        await jsonRequest(t, 'POST', '/api/patient/subscriptions', invalid, {
          cookie,
        })
      ).status,
      422,
    );
  }
});

test('HACK-24: seg–sex 18h–21h não combina com sábado 10h; lista conta clínicas', async () => {
  const response = await jsonRequest(
    t,
    'POST',
    '/api/patient/subscriptions',
    body,
    { cookie },
  );
  assert.equal(response.status, 201, await response.clone().text());
  const result = subscriptionResultSchema.parse(await response.json());
  subscriptionId = result.subscription.id;
  assert.equal(result.matchedVacancyId, null);
  assert.ok(result.subscription.clinicCount >= 1);
  assert.equal(result.subscription.expiresAt, '2030-01-31T12:00:00.000Z');
  const outsider = await jsonRequest(
    t,
    'GET',
    '/api/patient/subscriptions',
    undefined,
    { cookie: otherCookie },
  );
  assert.deepEqual(
    subscriptionListSchema.parse(await outsider.json()).subscriptions,
    [],
  );
  assert.equal(
    (
      await jsonRequest(
        t,
        'POST',
        `/api/patient/subscriptions/${subscriptionId}/renew`,
        undefined,
        { cookie: otherCookie },
      )
    ).status,
    404,
  );
});

test('HACK-24: reinscrição atualiza a mesma linha e retorna vaga existente imediatamente', async () => {
  const response = await jsonRequest(
    t,
    'POST',
    '/api/patient/subscriptions',
    {
      ...body,
      windows: [
        ...body.windows,
        { weekday: 6, startMinute: 480, endMinute: 780 },
      ],
    },
    { cookie },
  );
  const result = subscriptionResultSchema.parse(await response.json());
  assert.equal(result.subscription.id, subscriptionId);
  assert.equal(result.matchedVacancyId, vacancyId);
  assert.equal(
    (
      await t.prisma.subscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        include: { windows: true },
      })
    ).windows.length,
    6,
  );
});

test('HACK-24: expiração envia link autenticado uma vez; renovar reativa a mesma inscrição', async () => {
  const clock = t.app.get(ClockService);
  clock.now = () => new Date('2030-02-01T12:00:00Z');
  const email = t.app.get(EmailService);
  const sent: { text: string; idempotencyKey: string }[] = [];
  email.isConfigured = () => true;
  email.send = async (message, options) => {
    sent.push({ text: message.text, idempotencyKey: options.idempotencyKey });
    return { id: 'email-test' };
  };
  const job = t.app.get(SubscriptionExpiryJob);
  await job.run();
  await job.run();
  assert.equal(
    sent.filter((message) => message.text.includes(subscriptionId)).length,
    1,
  );
  assert.ok(
    sent.some((message) =>
      message.text.includes(`/paciente/inscricoes?renovar=${subscriptionId}`),
    ),
  );
  const listResponse = await jsonRequest(
    t,
    'GET',
    '/api/patient/subscriptions',
    undefined,
    { cookie },
  );
  assert.equal(
    subscriptionListSchema.parse(await listResponse.json()).subscriptions[0]
      ?.active,
    false,
  );
  const renewed = await jsonRequest(
    t,
    'POST',
    `/api/patient/subscriptions/${subscriptionId}/renew`,
    undefined,
    { cookie },
  );
  const result = subscriptionResultSchema.parse(await renewed.json());
  assert.equal(result.subscription.id, subscriptionId);
  assert.equal(result.subscription.active, true);
  assert.equal(result.subscription.expiresAt, '2030-03-03T12:00:00.000Z');
});
