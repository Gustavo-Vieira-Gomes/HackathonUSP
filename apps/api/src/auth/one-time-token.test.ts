import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../testing/test-app';

let t: TestApp;
before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.close();
});

async function generate(cookie?: string): Promise<Response> {
  return jsonRequest(
    t,
    'GET',
    '/api/auth/one-time-token/generate',
    undefined,
    cookie ? { cookie } : {},
  );
}

async function tokenFor(cookie: string): Promise<string> {
  const response = await generate(cookie);
  assert.equal(response.status, 200);
  const { token } = (await response.json()) as { token: string };
  return token;
}

test('C24 - generate responde 200 com token com cookie e 401 sem cookie', async () => {
  const { cookie } = await signUpWithCookie(t, 'paciente');
  const token = await tokenFor(cookie);
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 0);
  assert.equal((await generate()).status, 401);
});

test('C25 - verifyOneTimeToken devolve a sessão de quem gerou o token', async () => {
  for (const role of ['paciente', 'clinica'] as const) {
    const account = await signUpWithCookie(t, role);
    const session = await t.sessions.verifyOneTimeToken(
      await tokenFor(account.cookie),
    );
    assert.ok(session);
    assert.equal(session.user.id, account.id);
    assert.equal(session.user.role, role);
  }
});

test('C26 - o mesmo token verificado pela segunda vez devolve null', async () => {
  const { cookie } = await signUpWithCookie(t, 'clinica');
  const token = await tokenFor(cookie);
  assert.ok(await t.sessions.verifyOneTimeToken(token));
  assert.equal(await t.sessions.verifyOneTimeToken(token), null);
});

test('C27 - verify por HTTP responde 404 e o token segue verificável uma vez no serviço', async () => {
  const account = await signUpWithCookie(t, 'paciente');
  const token = await tokenFor(account.cookie);
  const response = await jsonRequest(
    t,
    'POST',
    '/api/auth/one-time-token/verify',
    { token },
  );
  assert.equal(response.status, 404);
  const session = await t.sessions.verifyOneTimeToken(token);
  assert.equal(session?.user.id, account.id);
});

test('C28 - nenhuma linha de Verification guarda o token em texto puro', async () => {
  const { cookie } = await signUpWithCookie(t, 'paciente');
  const token = await tokenFor(cookie);
  const rows = await t.prisma.verification.findMany({
    where: {
      OR: [{ identifier: { contains: token } }, { value: { contains: token } }],
    },
  });
  assert.equal(rows.length, 0);
  const stored = await t.prisma.verification.count({
    where: { identifier: { startsWith: 'one-time-token:' } },
  });
  assert.ok(stored > 0, 'o token deveria estar guardado (com hash)');
});
