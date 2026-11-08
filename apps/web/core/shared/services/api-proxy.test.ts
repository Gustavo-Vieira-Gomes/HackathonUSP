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

async function withProxyEnv(
  values: Record<string, string | undefined>,
  run: () => Promise<void>,
) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
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

test('R2 - proxy Vercel ignora IP/key do cliente e envia só IP da borda e chave do servidor', async () => {
  const key = 'a'.repeat(64);
  await withProxyEnv({ VERCEL: '1', AUTH_PROXY_SECRET: key }, async () => {
    for (const edgeIp of ['198.51.100.10', '2001:db8:1::1']) {
      const request = browserRequest('/api/auth/sign-in/email', {});
      request.headers.set('x-vercel-forwarded-for', edgeIp);
      request.headers.set('x-forwarded-for', '203.0.113.2, 203.0.113.3');
      request.headers.set('x-real-ip', '203.0.113.4');
      request.headers.set('forwarded', 'for=203.0.113.5');
      request.headers.set('x-hackathon-client-ip', '203.0.113.6');
      request.headers.set('x-hackathon-proxy-key', 'forged');
      await proxyToApi(request, '/api/auth/sign-in/email');
      const received = api.requests.at(-1);
      assert.equal(received?.headers['x-hackathon-client-ip'], edgeIp);
      assert.equal(received?.headers['x-hackathon-proxy-key'], key);
      for (const header of [
        'x-forwarded-for',
        'x-real-ip',
        'forwarded',
        'x-vercel-forwarded-for',
      ]) {
        assert.equal(received?.headers[header], undefined, header);
      }
    }
  });
});

test('R2 - falta de borda/IP único/configuração não chama upstream nem cria balde compartilhado', async () => {
  await withProxyEnv(
    { VERCEL: '1', AUTH_PROXY_SECRET: 'a'.repeat(64) },
    async () => {
      for (const ip of [
        null,
        '',
        '198.51.100.1, 198.51.100.2',
        'invalid',
        '1.2.3.4:80',
      ]) {
        const before = api.requests.length;
        const request = browserRequest('/api/auth/sign-in/email', {});
        if (ip !== null) request.headers.set('x-vercel-forwarded-for', ip);
        request.headers.set('x-forwarded-for', '198.51.100.99');
        assert.equal(
          (await proxyToApi(request, '/api/auth/sign-in/email')).status,
          503,
        );
        assert.equal(api.requests.length, before);
      }
    },
  );
  for (const env of [
    { VERCEL: '1', NODE_ENV: 'production', AUTH_PROXY_SECRET: undefined },
    { VERCEL: '1', NODE_ENV: 'production', AUTH_PROXY_SECRET: 'short' },
    { VERCEL: undefined, NODE_ENV: 'production', AUTH_PROXY_SECRET: undefined },
  ]) {
    await withProxyEnv(env, async () => {
      assert.equal(
        (
          await proxyToApi(
            browserRequest('/api/auth/sign-in/email', {}),
            '/api/auth/sign-in/email',
          )
        ).status,
        503,
      );
    });
  }
});

test('R2 - fora da Vercel headers não ativam confiança; segredo não segue por HTTP público', async () => {
  await withProxyEnv(
    { VERCEL: undefined, NODE_ENV: 'test', AUTH_PROXY_SECRET: undefined },
    async () => {
      const request = browserRequest('/api/auth/sign-in/email', {});
      request.headers.set('x-forwarded-for', '198.51.100.10');
      request.headers.set('x-vercel-forwarded-for', '198.51.100.20');
      request.headers.set('x-hackathon-client-ip', '198.51.100.30');
      request.headers.set('x-hackathon-proxy-key', 'forged');
      await proxyToApi(request, '/api/auth/sign-in/email');
      for (const header of [
        'x-forwarded-for',
        'x-vercel-forwarded-for',
        'x-hackathon-client-ip',
        'x-hackathon-proxy-key',
      ]) {
        assert.equal(api.requests.at(-1)?.headers[header], undefined, header);
      }
      assert.equal(
        (
          await proxyToApi(request, '/api/auth/sign-in/email', {
            baseUrl: 'https://api.example.test',
          })
        ).status,
        503,
      );
    },
  );
  await withProxyEnv(
    { VERCEL: '1', AUTH_PROXY_SECRET: 'a'.repeat(64) },
    async () => {
      const request = browserRequest('/api/auth/sign-in/email', {});
      request.headers.set('x-vercel-forwarded-for', '198.51.100.10');
      assert.equal(
        (
          await proxyToApi(request, '/api/auth/sign-in/email', {
            baseUrl: 'http://api.example.test',
          })
        ).status,
        503,
      );
    },
  );
});

test('R2 - proxy preserva 429 e Retry-After do limiter', async () => {
  const limited = await startFakeApi(() => ({
    status: 429,
    headers: { 'retry-after': '10' },
  }));
  try {
    const response = await proxyToApi(
      browserRequest('/api/auth/sign-in/email', {}),
      '/api/auth/sign-in/email',
      { baseUrl: limited.url },
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '10');
  } finally {
    await limited.close();
  }
});
