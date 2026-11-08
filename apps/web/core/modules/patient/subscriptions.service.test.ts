import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPatientSubscriptions } from './subscriptions.service';

const options = { baseUrl: 'http://127.0.0.1:3001' };

test('lista repassa sessão sem cache e preserva vazio real', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      assert.equal(
        new URL(String(input)).pathname,
        '/api/patient/subscriptions',
      );
      assert.equal(new Headers(init?.headers).get('cookie'), 'session=patient');
      assert.equal(init?.cache, 'no-store');
      assert.ok(init?.signal);
      return Response.json({ subscriptions: [] });
    },
  );
  assert.deepEqual(await getPatientSubscriptions('session=patient', options), {
    kind: 'ok',
    subscriptions: [],
  });
});

test('sessão expirada, resposta inválida e falha não aparecem como lista vazia', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { status: 401 }),
  );
  assert.deepEqual(await getPatientSubscriptions('', options), {
    kind: 'unauthenticated',
  });
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ subscriptions: [{ id: 'inválido' }] }),
  );
  assert.deepEqual(await getPatientSubscriptions('session=patient', options), {
    kind: 'error',
  });
  t.mock.method(globalThis, 'fetch', async () => {
    throw new DOMException('timeout', 'TimeoutError');
  });
  assert.deepEqual(await getPatientSubscriptions('session=patient', options), {
    kind: 'error',
  });
});
