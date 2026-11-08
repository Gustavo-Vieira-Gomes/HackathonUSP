import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pushSubscriptionBodySchema } from './push';
const body = {
  endpoint: 'https://fcm.googleapis.com/send/test',
  expirationTime: null,
  keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) },
};
test('subscription aceita JSON do navegador e recusa destinos internos, credenciais e chaves inválidas', () => {
  assert.equal(pushSubscriptionBodySchema.safeParse(body).success, true);
  for (const endpoint of [
    'bad',
    'http://fcm.googleapis.com/send/x',
    'https://127.0.0.1/private',
    'https://fcm.googleapis.com.attacker.test/x',
    'https://user:pass@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
  ])
    assert.equal(
      pushSubscriptionBodySchema.safeParse({ ...body, endpoint }).success,
      false,
      endpoint,
    );
  assert.equal(
    pushSubscriptionBodySchema.safeParse({
      ...body,
      keys: { ...body.keys, auth: 'bad' },
    }).success,
    false,
  );
});
