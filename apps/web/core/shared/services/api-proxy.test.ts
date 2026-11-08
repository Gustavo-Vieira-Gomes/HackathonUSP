import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { POST as authPost } from '../../../app/api/auth/[...path]/route';
import { POST as signUpPost } from '../../../app/api/sign-up/[role]/route';
import { API_PROXY_TIMEOUT_MS, proxyToApi } from './api-proxy.service';
import { closedPortUrl, startFakeApi } from './fake-api.test-helper';

const cookiesFromApi = [
  'better-auth.session_token=abc.def; Path=/; HttpOnly; SameSite=Lax',
  'better-auth.session_data=xyz; Path=/; HttpOnly; SameSite=Lax',
];
const statusByPath: Record<string, number> = {
  '/api/auth/sign-in/email': 401,
  '/api/sign-up/paciente': 200,
  '/api/sign-up/clinica': 422,
};

let api: Awaited<ReturnType<typeof startFakeApi>>;
before(async () => {
  api = await startFakeApi((request) => ({
    status: statusByPath[request.url] ?? 500,
    headers: {
      'content-type': 'application/json',
      'set-cookie': cookiesFromApi,
    },
    body: JSON.stringify({ echo: request.url }),
  }));
  process.env.API_BASE_URL = api.url;
});
after(async () => {
  await api.close();
});

function browserRequest(path: string, body: unknown): Request {
  return new Request(`http://127.0.0.1:3120${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'better-auth.session_token=antigo',
      origin: 'http://127.0.0.1:3120',
    },
    body: JSON.stringify(body),
  });
}

test('C29 - repasse das 3 rotas leva método, corpo e cookie e devolve status, corpo e set-cookie', async () => {
  const cases: [string, () => Promise<Response>][] = [
    [
      '/api/auth/sign-in/email',
      () =>
        authPost(
          browserRequest('/api/auth/sign-in/email', { email: 'a@b.c' }),
          {
            params: Promise.resolve({ path: ['sign-in', 'email'] }),
          },
        ),
    ],
    [
      '/api/sign-up/paciente',
      () =>
        signUpPost(
          browserRequest('/api/sign-up/paciente', { email: 'a@b.c' }),
          {
            params: Promise.resolve({ role: 'paciente' }),
          },
        ),
    ],
    [
      '/api/sign-up/clinica',
      () =>
        signUpPost(browserRequest('/api/sign-up/clinica', { email: 'a@b.c' }), {
          params: Promise.resolve({ role: 'clinica' }),
        }),
    ],
  ];
  for (const [path, call] of cases) {
    const before = api.requests.length;
    const response = await call();
    assert.equal(api.requests.length, before + 1, path);
    const received = api.requests.at(-1);
    assert.ok(received);
    assert.equal(received.method, 'POST');
    assert.equal(received.url, path);
    assert.equal(received.body, JSON.stringify({ email: 'a@b.c' }));
    assert.equal(received.headers.cookie, 'better-auth.session_token=antigo');
    assert.equal(received.headers.origin, 'http://127.0.0.1:3120');
    assert.equal(response.status, statusByPath[path], path);
    assert.deepEqual(await response.json(), { echo: path });
    assert.deepEqual(response.headers.getSetCookie(), cookiesFromApi);
  }
});

test('C30 - cadastro com papel fora de paciente/clinica responde 404 sem chamar o Nest', async () => {
  const before = api.requests.length;
  const response = await signUpPost(browserRequest('/api/sign-up/admin', {}), {
    params: Promise.resolve({ role: 'admin' }),
  });
  assert.equal(response.status, 404);
  assert.equal(api.requests.length, before);
});

test('C32 - timeout responde 504, conexão recusada 502, nunca 200; padrão de 10000 ms', async () => {
  assert.equal(API_PROXY_TIMEOUT_MS, 10_000);

  const stuck = await startFakeApi(() => null);
  try {
    const response = await proxyToApi(
      browserRequest('/api/auth/sign-in/email', {}),
      '/api/auth/sign-in/email',
      { baseUrl: stuck.url, timeoutMs: 100 },
    );
    assert.equal(response.status, 504);
  } finally {
    await stuck.close();
  }

  const refused = await proxyToApi(
    browserRequest('/api/auth/sign-in/email', {}),
    '/api/auth/sign-in/email',
    { baseUrl: await closedPortUrl() },
  );
  assert.equal(refused.status, 502);
});
