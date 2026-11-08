import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { apiErrorSchema } from '@hackathon/contracts';
import {
  call,
  closeDatabase,
  cookieHeader,
  query,
  resetDatabase,
  type RunningApi,
  sessionSetCookie,
  signUp,
  startApi,
  testConfig,
} from '../../test-support/api';

let api: RunningApi;

before(async () => {
  api = await startApi();
});
after(async () => {
  await api.close();
  await closeDatabase();
});
beforeEach(resetDatabase);

function login(baseUrl: string, email: string, password: string) {
  return call(baseUrl, 'POST', '/api/sessions', { body: { email, password } });
}

test('C17 login correto responde 200 com o paciente e cookie', async () => {
  const { id } = await signUp(api.url);
  const result = await login(
    api.url,
    'MARIA@Exemplo.com',
    'senha-da-maria-123',
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    id,
    name: 'Maria Souza',
    email: 'maria@exemplo.com',
    phone: '+5511987654321',
  });
  const cookie = sessionSetCookie(result.setCookies);
  assert.ok(cookie, 'resposta sem cookie de sessão');
  const attributes = cookie
    .split(';')
    .slice(1)
    .map((part) => part.trim().toLowerCase());
  for (const attribute of [
    'httponly',
    'samesite=lax',
    'path=/',
    'max-age=604800',
  ]) {
    assert.ok(attributes.includes(attribute), attribute);
  }
});

test('C18 login errado responde 401 igual para e-mail inexistente e senha errada', async () => {
  await signUp(api.url);
  const unknownEmail = await login(
    api.url,
    'ninguem@exemplo.com',
    'senha-da-maria-123',
  );
  const wrongPassword = await login(
    api.url,
    'maria@exemplo.com',
    'senha-errada-000',
  );

  for (const result of [unknownEmail, wrongPassword]) {
    assert.equal(result.status, 401);
    assert.equal(apiErrorSchema.parse(result.body).code, 'invalid_credentials');
    assert.equal(sessionSetCookie(result.setCookies), undefined);
  }
  assert.deepEqual(unknownEmail.body, wrongPassword.body);
});

test('C19 login com formato inválido responde 400', async () => {
  for (const [body, fields] of [
    [{ email: 'maria.exemplo.com', password: 'qualquer-senha' }, ['email']],
    [{ email: 'maria@exemplo.com', password: '' }, ['password']],
  ] as const) {
    const result = await call(api.url, 'POST', '/api/sessions', { body });
    assert.equal(result.status, 400);
    const error = apiErrorSchema.parse(result.body);
    assert.equal(error.code, 'validation_failed');
    assert.deepEqual(error.fields, fields);
  }
});

test('C20 sexta tentativa em 60 s por e-mail responde 429', async () => {
  // App própria: o contador do limite vive na instância.
  const limited = await startApi();
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    await signUp(limited.url);
    await signUp(limited.url, { email: 'joao@exemplo.com' });

    for (let attempt = 1; attempt <= 5; attempt++) {
      const result = await login(
        limited.url,
        'maria@exemplo.com',
        'senha-errada-000',
      );
      assert.equal(result.status, 401, `tentativa ${attempt}`);
    }
    const blocked = await login(
      limited.url,
      'MARIA@exemplo.com',
      'senha-da-maria-123',
    );
    assert.equal(blocked.status, 429);
    assert.equal(apiErrorSchema.parse(blocked.body).code, 'rate_limited');
    const retryAfter = Number(blocked.headers.get('retry-after'));
    assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After ${retryAfter}`);

    const otherEmail = await login(
      limited.url,
      'joao@exemplo.com',
      'senha-da-maria-123',
    );
    assert.equal(otherEmail.status, 200);

    // Bloqueio de 60 s a partir da 6ª (t=0): em t=30 s ainda 429; em t=60 s libera.
    mock.timers.tick(30_000);
    const midWindow = await login(
      limited.url,
      'maria@exemplo.com',
      'senha-da-maria-123',
    );
    assert.equal(midWindow.status, 429);
    mock.timers.tick(30_001);
    const afterWindow = await login(
      limited.url,
      'maria@exemplo.com',
      'senha-da-maria-123',
    );
    assert.equal(afterWindow.status, 200);
  } finally {
    mock.timers.reset();
    await limited.close();
  }
});

test('C23 saída revoga a sessão e expira o cookie', async () => {
  const { cookie } = await signUp(api.url);
  assert.equal((await query('SELECT id FROM "session"')).length, 1);

  const result = await call(api.url, 'DELETE', '/api/sessions/current', {
    cookie,
  });
  assert.equal(result.status, 204);
  assert.equal(result.text, '');
  assert.equal((await query('SELECT id FROM "session"')).length, 0);
  const expired = sessionSetCookie(result.setCookies);
  assert.ok(expired, 'resposta sem cookie expirado');
  assert.match(expired, /max-age=0/i);

  const me = await call(api.url, 'GET', '/api/patients/me', { cookie });
  assert.equal(me.status, 401);

  const withoutCookie = await call(api.url, 'DELETE', '/api/sessions/current');
  assert.equal(withoutCookie.status, 204);
  assert.match(sessionSetCookie(withoutCookie.setCookies) ?? '', /max-age=0/i);
  const again = await call(api.url, 'DELETE', '/api/sessions/current', {
    cookie,
  });
  assert.equal(again.status, 204);
  assert.ok(cookieHeader(withoutCookie.setCookies).endsWith('='));
});

test('C42 saída com banco inacessível responde 503 e não finge sucesso', async () => {
  const { cookie } = await signUp(api.url);
  const { createServer } = await import('node:net');
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  const down = await startApi({
    config: testConfig({ databaseUrl: `postgresql://x:x@127.0.0.1:${port}/x` }),
  });
  try {
    const result = await call(down.url, 'DELETE', '/api/sessions/current', {
      cookie,
    });
    assert.equal(result.status, 503);
    assert.equal(apiErrorSchema.parse(result.body).code, 'service_unavailable');
  } finally {
    await down.close();
  }
  assert.equal((await query('SELECT id FROM "session"')).length, 1);
});

test('C43 sessão não é renovada por uso: vence 7 dias após o login', async () => {
  const { cookie } = await signUp(api.url);
  await query(`UPDATE "session" SET "expiresAt" = now() + interval '5 days'`);
  const [before] = await query<{ expiresAt: Date }>(
    'SELECT "expiresAt" FROM "session"',
  );
  const me = await call(api.url, 'GET', '/api/patients/me', { cookie });
  assert.equal(me.status, 200);
  assert.deepEqual(me.setCookies, []);
  const [after] = await query<{ expiresAt: Date }>(
    'SELECT "expiresAt" FROM "session"',
  );
  assert.equal(after?.expiresAt.getTime(), before?.expiresAt.getTime());
});
