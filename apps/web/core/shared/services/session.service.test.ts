import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closedPortUrl, startFakeApi } from './fake-api.test-helper';
import { getSessionUser } from './session.service';

const user = {
  id: 'u1',
  name: 'Fulana',
  email: 'fulana@teste.local',
  role: 'paciente',
};

test('C31 - consulta /api/me com o cookie recebido e devolve o usuário validado', async () => {
  const api = await startFakeApi(() => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  }));
  try {
    const result = await getSessionUser('better-auth.session_token=abc', {
      baseUrl: api.url,
    });
    assert.deepEqual(result, user);
    assert.equal(api.requests.length, 1);
    assert.equal(api.requests[0]?.method, 'GET');
    assert.equal(api.requests[0]?.url, '/api/me');
    assert.equal(
      api.requests[0]?.headers.cookie,
      'better-auth.session_token=abc',
    );
  } finally {
    await api.close();
  }
});

test('C33 - 401, falha de conexão, timeout e corpo inválido viram null sem lançar', async () => {
  const unauthorized = await startFakeApi(() => ({ status: 401, body: '{}' }));
  const stuck = await startFakeApi(() => null);
  const invalid = await startFakeApi(() => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, role: 'admin' }),
  }));
  try {
    const cookie = 'better-auth.session_token=abc';
    const cases: [string, Promise<unknown>][] = [
      ['401', getSessionUser(cookie, { baseUrl: unauthorized.url })],
      ['conexão', getSessionUser(cookie, { baseUrl: await closedPortUrl() })],
      [
        'timeout',
        getSessionUser(cookie, { baseUrl: stuck.url, timeoutMs: 100 }),
      ],
      ['corpo inválido', getSessionUser(cookie, { baseUrl: invalid.url })],
    ];
    for (const [label, call] of cases) {
      assert.equal(await call, null, label);
    }
  } finally {
    await Promise.all([unauthorized.close(), stuck.close(), invalid.close()]);
  }
});
