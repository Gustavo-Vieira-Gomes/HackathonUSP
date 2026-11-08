import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import webpush from 'web-push';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../../testing/test-app';

const vapid = webpush.generateVAPIDKeys();
let app: TestApp;
let disabled: TestApp;
before(async () => {
  app = await startTestApp({
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: 'mailto:dev@example.com',
  });
  disabled = await startTestApp({
    VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY: '',
    VAPID_SUBJECT: '',
  });
});
after(async () => {
  await app.close();
  await disabled.close();
});
async function patient() {
  const account = await signUpWithCookie(app, 'paciente');
  const profile = await app.prisma.patient.upsert({
    where: { userId: account.id },
    update: {},
    create: {
      userId: account.id,
      phone: '+5511999990000',
      healthDataConsentAt: new Date(),
    },
  });
  return { cookie: account.cookie, id: profile.id };
}
const body = {
  endpoint: 'https://fcm.googleapis.com/send/hack35-test',
  expirationTime: null,
  keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) },
};
const post = (cookie: string, value: unknown = body) =>
  jsonRequest(app, 'POST', '/api/patient/push/subscriptions', value, {
    cookie,
  });

test('push HTTP exige sessão paciente, valida o destino e associa só ao paciente da sessão', async () => {
  assert.equal(
    (await jsonRequest(app, 'GET', '/api/patient/push/key')).status,
    401,
  );
  const clinic = await signUpWithCookie(app, 'clinica');
  assert.equal((await post(clinic.cookie)).status, 403);
  const a = await patient();
  assert.deepEqual(
    await (
      await jsonRequest(app, 'GET', '/api/patient/push/key', undefined, {
        cookie: a.cookie,
      })
    ).json(),
    { publicKey: vapid.publicKey },
  );
  assert.equal(
    (await post(a.cookie, { ...body, patientId: a.id })).status,
    422,
  );
  assert.equal(
    (await post(a.cookie, { ...body, endpoint: 'https://localhost/private' }))
      .status,
    422,
  );
  assert.equal(
    (await post(a.cookie, { ...body, endpoint: 'bad' })).status,
    422,
  );
  assert.equal((await post(a.cookie)).status, 200);
  assert.equal((await post(a.cookie)).status, 200);
  assert.equal(
    await app.prisma.pushSubscription.count({ where: { patientId: a.id } }),
    1,
  );
  const b = await patient();
  // A troca de conta no mesmo navegador reassocia o destino; não entrega saúde da conta anterior.
  assert.equal((await post(b.cookie)).status, 200);
  assert.equal(
    await app.prisma.pushSubscription.count({ where: { patientId: a.id } }),
    0,
  );
  assert.equal(
    (
      await jsonRequest(
        app,
        'DELETE',
        '/api/patient/push/subscriptions',
        { endpoint: body.endpoint },
        { cookie: a.cookie },
      )
    ).status,
    200,
  );
  assert.equal(
    await app.prisma.pushSubscription.count({ where: { patientId: b.id } }),
    1,
  );
  assert.equal(
    (
      await jsonRequest(
        app,
        'DELETE',
        '/api/patient/push/subscriptions',
        { endpoint: body.endpoint },
        { cookie: b.cookie },
      )
    ).status,
    200,
  );
  assert.equal(
    await app.prisma.pushSubscription.count({ where: { patientId: b.id } }),
    0,
  );
});

test('sem VAPID responde chave nula e não registra envio fictício', async () => {
  const account = await signUpWithCookie(disabled, 'paciente');
  await disabled.prisma.patient.upsert({
    where: { userId: account.id },
    update: {},
    create: {
      userId: account.id,
      phone: '+5511999990001',
      healthDataConsentAt: new Date(),
    },
  });
  assert.deepEqual(
    await (
      await jsonRequest(disabled, 'GET', '/api/patient/push/key', undefined, {
        cookie: account.cookie,
      })
    ).json(),
    { publicKey: null },
  );
  assert.equal(
    (
      await jsonRequest(
        disabled,
        'POST',
        '/api/patient/push/subscriptions',
        body,
        { cookie: account.cookie },
      )
    ).status,
    503,
  );
});
