import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canOfferPush, vapidKeyBytes } from '../push-permission';

test('push só é oferecido após inscrição, com suporte e permissão não negada', () => {
  assert.equal(canOfferPush(false, true, 'default'), false);
  assert.equal(canOfferPush(true, false, 'default'), false);
  assert.equal(canOfferPush(true, true, 'denied'), false);
  assert.equal(canOfferPush(true, true, 'default'), true);
  assert.equal(canOfferPush(true, true, 'granted'), true);
});

test('chave pública base64url vira bytes para PushManager', () => {
  assert.deepEqual([...vapidKeyBytes('AQID-_8')], [1, 2, 3, 251, 255]);
});
