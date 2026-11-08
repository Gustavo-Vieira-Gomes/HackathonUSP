import assert from 'node:assert/strict';
import { test } from 'node:test';
import webpush from 'web-push';
import { loadEnv } from '../../../config/env';
import { PrismaService } from '../../../prisma/prisma.service';
import { PushService } from './push.service';
import { ChannelUnavailableError } from '../notification.types';

const keys = webpush.generateVAPIDKeys();
const env = loadEnv({
  DATABASE_URL: 'postgresql://localhost/test',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  BETTER_AUTH_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:3000',
  VAPID_PUBLIC_KEY: keys.publicKey,
  VAPID_PRIVATE_KEY: keys.privateKey,
  VAPID_SUBJECT: 'mailto:dev@example.com',
});
const subscription = {
  id: 's1',
  endpoint: 'https://fcm.googleapis.com/send/abc',
  p256dh: 'public',
  auth: 'secret',
};
const notification = {
  title: 'Vaga disponível',
  body: 'Clínica, exame, horário, preço, distância e preparo',
  url: 'http://localhost:3000/paciente/vagas/123',
};
function fixture(rows = [subscription]) {
  const removed: unknown[] = [];
  const prisma = {
    pushSubscription: {
      findMany: async () => rows,
      deleteMany: async (arg: unknown) => {
        removed.push(arg);
        return { count: 1 };
      },
    },
  } as unknown as PrismaService;
  return { service: new PushService(env, prisma), removed };
}
test('push usa cliente web-push com payload comum e identidade estável do alerta', async (t) => {
  const calls: unknown[][] = [];
  t.mock.method(webpush, 'sendNotification', async (...args: unknown[]) => {
    calls.push(args);
    return { statusCode: 201, headers: {}, body: '' };
  });
  const { service } = fixture();
  await service.send(
    'patient-1',
    notification,
    new AbortController().signal,
    'alert-1',
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0]);
  assert.deepEqual(JSON.parse(String(calls[0][1])), {
    ...notification,
    tag: 'alert-1',
  });
  assert.deepEqual(calls[0][0], {
    endpoint: subscription.endpoint,
    keys: { p256dh: 'public', auth: 'secret' },
  });
  assert.equal((calls[0][2] as { timeout: number }).timeout, 4000);
});
for (const statusCode of [404, 410])
  test(`push remove subscription ${statusCode} e reporta sem canal`, async (t) => {
    t.mock.method(webpush, 'sendNotification', async () => {
      throw { statusCode };
    });
    const { service, removed } = fixture();
    await assert.rejects(
      service.send(
        'patient-1',
        notification,
        new AbortController().signal,
        'alert-1',
      ),
      ChannelUnavailableError,
    );
    assert.deepEqual(removed, [
      { where: { id: 's1', patientId: 'patient-1' } },
    ]);
  });
test('sem subscriptions é sem canal; falha temporária preserva subscription e não expõe endpoint', async (t) => {
  await assert.rejects(
    fixture([]).service.send(
      'p',
      notification,
      new AbortController().signal,
      'a',
    ),
    ChannelUnavailableError,
  );
  t.mock.method(webpush, 'sendNotification', async () => {
    throw new Error(subscription.endpoint);
  });
  const { service, removed } = fixture();
  await assert.rejects(
    service.send('p', notification, new AbortController().signal, 'a'),
    { message: 'Falha no serviço de push.' },
  );
  assert.equal(removed.length, 0);
});
test('sem VAPID o canal está desabilitado; configuração parcial e inválida é recusada', () => {
  assert.equal(
    new PushService(
      {
        ...env,
        VAPID_PUBLIC_KEY: undefined,
        VAPID_PRIVATE_KEY: undefined,
        VAPID_SUBJECT: undefined,
      },
      {} as PrismaService,
    ).isConfigured(),
    false,
  );
  assert.throws(() =>
    loadEnv({
      ...process.env,
      DATABASE_URL: 'db',
      BETTER_AUTH_SECRET: 'x'.repeat(40),
      BETTER_AUTH_URL: 'http://localhost',
      WEB_ORIGIN: 'http://localhost',
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: '',
      VAPID_SUBJECT: '',
    }),
  );
});
