import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sessionUserSchema } from '@hackathon/contracts';
import {
  jsonRequest,
  signUp,
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

const me = (cookie?: string) =>
  jsonRequest(t, 'GET', '/api/me', undefined, cookie ? { cookie } : {});

/** Troca um caractere do token (antes da assinatura) mantendo o formato do cookie. */
function tamper(cookie: string): string {
  const [name, value = ''] = cookie.split('=');
  const swapped = (value[0] === 'a' ? 'b' : 'a') + value.slice(1);
  return `${name}=${swapped}`;
}

test('C13 - sign-in com credenciais corretas responde 200 com cookie HttpOnly', async () => {
  const account = await signUpWithCookie(t, 'paciente');
  const response = await jsonRequest(t, 'POST', '/api/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  assert.equal(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .find((line) => line.includes('session_token='));
  assert.ok(cookie);
  assert.match(cookie, /;\s*HttpOnly/i);
});

test('C14 - senha errada e e-mail inexistente respondem 401 com o mesmo corpo', async () => {
  const account = await signUpWithCookie(t, 'clinica');
  const wrongPassword = await jsonRequest(
    t,
    'POST',
    '/api/auth/sign-in/email',
    {
      email: account.email,
      password: 'senha-errada-1',
    },
  );
  const unknownEmail = await jsonRequest(t, 'POST', '/api/auth/sign-in/email', {
    email: t.email(),
    password: 'senha-errada-1',
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(await wrongPassword.json(), await unknownEmail.json());
});

test('C15 - sign-out responde 200 e a sessão deixa de autorizar /api/me', async () => {
  const { cookie } = await signUpWithCookie(t, 'paciente');
  assert.equal((await me(cookie)).status, 200);
  const response = await jsonRequest(
    t,
    'POST',
    '/api/auth/sign-out',
    {},
    { cookie },
  );
  assert.equal(response.status, 200);
  assert.equal((await me(cookie)).status, 401);
});

test('C16 - update-user com role responde 400 FIELD_NOT_ALLOWED e o papel não muda', async () => {
  const { cookie } = await signUpWithCookie(t, 'paciente');
  const response = await jsonRequest(
    t,
    'POST',
    '/api/auth/update-user',
    { role: 'clinica' },
    { cookie },
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { code?: string };
  assert.equal(body.code, 'FIELD_NOT_ALLOWED');
  const user = sessionUserSchema.parse(await (await me(cookie)).json());
  assert.equal(user.role, 'paciente');
});

test('C17 - sign-in com Origin fora de WEB_ORIGIN responde 403 sem cookie', async () => {
  const account = await signUpWithCookie(t, 'paciente');
  const response = await jsonRequest(
    t,
    'POST',
    '/api/auth/sign-in/email',
    { email: account.email, password: account.password },
    { origin: 'http://evil.example' },
  );
  assert.equal(response.status, 403);
  assert.equal(
    response.headers
      .getSetCookie()
      .some((line) => line.includes('session_token=')),
    false,
  );
});

test('C18 - cookie de sessão leva Secure só quando BETTER_AUTH_URL é https', async () => {
  const sessionLine = (response: Response) =>
    response.headers
      .getSetCookie()
      .find((line) => line.includes('session_token=')) ?? '';

  const plain = await signUp(t, 'paciente', {
    name: 'Http',
    email: t.email(),
    password: '12345678',
  });
  assert.equal(plain.status, 200);
  assert.doesNotMatch(sessionLine(plain), /;\s*Secure/i);

  const secure = await startTestApp({
    BETTER_AUTH_URL: 'https://api.exemplo.test',
  });
  try {
    const response = await signUp(secure, 'paciente', {
      name: 'Https',
      email: secure.email(),
      password: '12345678',
    });
    assert.equal(response.status, 200);
    assert.match(sessionLine(response), /;\s*Secure/i);
  } finally {
    await secure.close();
  }
});

test('C19 - /api/me com cookie válido devolve exatamente id, name, email e role', async () => {
  const account = await signUpWithCookie(t, 'clinica');
  const response = await me(account.cookie);
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ['email', 'id', 'name', 'role']);
  const user = sessionUserSchema.parse(body);
  assert.deepEqual(user, {
    id: account.id,
    name: 'Teste clinica',
    email: account.email,
    role: 'clinica',
  });
});

test('C20 - /api/me sem cookie, adulterado ou encerrado responde 401 sem usuário', async () => {
  const { cookie } = await signUpWithCookie(t, 'paciente');
  const ended = await signUpWithCookie(t, 'paciente');
  assert.equal(
    (
      await jsonRequest(
        t,
        'POST',
        '/api/auth/sign-out',
        {},
        { cookie: ended.cookie },
      )
    ).status,
    200,
  );
  const cases: [string, string | undefined][] = [
    ['sem cookie', undefined],
    ['adulterado', tamper(cookie)],
    ['encerrada', ended.cookie],
  ];
  for (const [label, value] of cases) {
    const response = await me(value);
    assert.equal(response.status, 401, label);
    const text = await response.text();
    assert.equal(text.includes('"email"'), false, label);
    assert.equal(text.includes('"id"'), false, label);
  }
});

test('C23 - AuthSessionService.getSession devolve id e papel com cookie válido e null sem ele', async () => {
  for (const role of ['paciente', 'clinica'] as const) {
    const account = await signUpWithCookie(t, role);
    const session = await t.sessions.getSession(
      new Headers({ cookie: account.cookie }),
    );
    assert.ok(session);
    assert.equal(session.user.id, account.id);
    assert.equal(session.user.role, role);
    const fromNode = await t.sessions.getSession({ cookie: account.cookie });
    assert.equal(fromNode?.user.id, account.id);
    assert.equal(
      await t.sessions.getSession({ cookie: tamper(account.cookie) }),
      null,
    );
  }
  assert.equal(await t.sessions.getSession({}), null);
});
