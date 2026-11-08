import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import type { LoggerService } from '@nestjs/common';
import { apiErrorSchema, healthResponseSchema } from '@hackathon/contracts';
import { parsePort } from './app';
import {
  call,
  closeDatabase,
  cookieHeader,
  resetDatabase,
  SESSION_COOKIE,
  signUp,
  startApi,
  TEST_DATABASE_URL,
  TEST_SECRET,
  testConfig,
  validSignUp,
} from './test-support/api';

after(closeDatabase);
beforeEach(resetDatabase);

async function closedPort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function startWithDatabaseDown() {
  const port = await closedPort();
  return startApi({
    config: testConfig({
      databaseUrl: `postgresql://hackathon:hackathon@127.0.0.1:${port}/inexistente`,
    }),
  });
}

test('API expõe saúde via HTTP e mantém rotas desconhecidas como 404', async () => {
  const api = await startApi();
  try {
    const response = await call(api.url, 'GET', '/api/health');
    assert.equal(response.status, 200);
    assert.deepEqual(healthResponseSchema.parse(response.body), {
      status: 'ok',
      service: 'api',
    });
    assert.equal((await call(api.url, 'GET', '/api/missing')).status, 404);
  } finally {
    await api.close();
  }
});

test('configuração de porta inválida falha antes de iniciar o servidor', () => {
  assert.equal(parsePort(undefined), 3001);
  assert.equal(parsePort('4000'), 4000);
  for (const port of ['', ' ', 'abc', '0', '-1', '65536', '1.5']) {
    assert.throws(() => parsePort(port), /PORT/);
  }
});

test('C34 API não inicia sem configuração obrigatória', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'api-config-'));
  const port = await closedPort();
  const base = {
    PATH: process.env.PATH ?? '',
    HOST: '127.0.0.1',
    PORT: String(port),
    DATABASE_URL: TEST_DATABASE_URL,
    BETTER_AUTH_SECRET: TEST_SECRET,
  };
  const shortSecret = 's'.repeat(31);
  const cases: Array<[string, Record<string, string>, string, string]> = [
    ['sem DATABASE_URL', { DATABASE_URL: '' }, 'DATABASE_URL', TEST_SECRET],
    [
      'sem BETTER_AUTH_SECRET',
      { BETTER_AUTH_SECRET: '' },
      'BETTER_AUTH_SECRET',
      TEST_DATABASE_URL,
    ],
    [
      'segredo de 31 caracteres',
      { BETTER_AUTH_SECRET: shortSecret },
      'BETTER_AUTH_SECRET',
      shortSecret,
    ],
  ];
  try {
    for (const [label, overrides, variable, secretValue] of cases) {
      const env: Record<string, string> = { ...base, ...overrides };
      for (const [key, value] of Object.entries(env))
        if (!value) delete env[key];
      const child = spawn(process.execPath, [join(__dirname, 'main.js')], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
      const [code] = (await once(child, 'exit')) as [number | null];
      clearTimeout(timer);
      assert.ok(code !== null && code !== 0, `${label}: código ${code}`);
      assert.ok(output.includes(variable), `${label}: ${output}`);
      assert.ok(!output.includes(secretValue), `${label}: valor exposto`);
      assert.ok(!/Nest application successfully started/.test(output), label);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('C35 banco inacessível responde 503 sem criar sessão', async () => {
  const api = await startWithDatabaseDown();
  try {
    const results = [
      await call(api.url, 'POST', '/api/patients', { body: validSignUp() }),
      await call(api.url, 'POST', '/api/sessions', {
        body: { email: 'maria@exemplo.com', password: 'senha-da-maria-123' },
      }),
      await call(api.url, 'GET', '/api/patients/me', {
        cookie: `${SESSION_COOKIE}=algum-token.assinatura`,
      }),
    ];
    for (const result of results) {
      assert.equal(result.status, 503, result.text);
      assert.equal(
        apiErrorSchema.parse(result.body).code,
        'service_unavailable',
      );
      assert.deepEqual(result.setCookies, []);
    }
  } finally {
    await api.close();
  }
});

test('C36 saúde responde 200 com o banco inacessível', async () => {
  const api = await startWithDatabaseDown();
  try {
    const response = await call(api.url, 'GET', '/api/health');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok', service: 'api' });
  } finally {
    await api.close();
  }
});

test('C37 rota desconhecida responde 404 no formato de erro', async () => {
  const api = await startApi();
  try {
    for (const [method, path] of [
      ['GET', '/api/missing'],
      ['POST', '/api/patients/qualquer'],
      ['GET', '/fora-do-prefixo'],
    ]) {
      const result = await call(api.url, method ?? 'GET', path ?? '/');
      assert.equal(result.status, 404, path);
      assert.equal(
        apiErrorSchema.strict().parse(result.body).code,
        'not_found',
      );
    }
  } finally {
    await api.close();
  }
});

test('C38 logs não contêm senha nem token', async () => {
  const lines: string[] = [];
  const capture = (...parts: unknown[]) => {
    lines.push(
      parts
        .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
        .join(' '),
    );
  };
  const logger: LoggerService = {
    log: capture,
    error: capture,
    warn: capture,
    debug: capture,
    verbose: capture,
    fatal: capture,
  };
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  const intercept = (chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  };
  const password = 'senha-rastreavel-no-log-42';
  const api = await startApi({ logger });
  let tokens: string[] = [];
  process.stdout.write = intercept as typeof process.stdout.write;
  process.stderr.write = intercept as typeof process.stderr.write;
  try {
    const created = await call(api.url, 'POST', '/api/patients', {
      body: validSignUp({ password }),
    });
    await call(api.url, 'POST', '/api/sessions', {
      body: { email: 'maria@exemplo.com', password: `${password}-errada` },
    });
    const login = await call(api.url, 'POST', '/api/sessions', {
      body: { email: 'maria@exemplo.com', password },
    });
    const cookie = cookieHeader(login.setCookies);
    await call(api.url, 'GET', '/api/patients/me', { cookie });
    await call(api.url, 'POST', '/api/patients', {
      body: validSignUp({ password }),
    });
    tokens = [cookieHeader(created.setCookies), cookie].map(
      (value) =>
        decodeURIComponent(value.split('=')[1] ?? '').split('.')[0] ?? '',
    );
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
    await api.close();
  }
  const output = lines.join('\n');
  assert.ok(lines.length > 0, 'nenhuma linha de log capturada');
  assert.ok(!output.includes(password), 'senha no log');
  for (const token of tokens) {
    assert.ok(token.length > 10);
    assert.ok(!output.includes(token), 'token no log');
  }
  assert.ok(!/cookie/i.test(output), 'cookie no log');
});

test('C39 erros das rotas seguem o contrato de erro', async () => {
  const api = await startApi();
  try {
    const { cookie } = await signUp(api.url);
    const errors = [
      await call(api.url, 'POST', '/api/patients', {
        body: validSignUp({ email: 'x' }),
      }),
      await call(api.url, 'POST', '/api/patients', { body: validSignUp() }),
      await call(api.url, 'POST', '/api/patients', {
        body: validSignUp({
          email: 'joao@exemplo.com',
          healthDataConsent: false,
        }),
      }),
      await call(api.url, 'POST', '/api/patients', { body: 'não é json' }),
      await call(api.url, 'POST', '/api/sessions', {
        body: { email: 'x', password: '' },
      }),
      await call(api.url, 'POST', '/api/sessions', {
        body: { email: 'maria@exemplo.com', password: 'senha-errada-000' },
      }),
      await call(api.url, 'GET', '/api/patients/me'),
      await call(api.url, 'GET', '/api/patients/me', { cookie: `${cookie}x` }),
    ];
    const expected = [400, 409, 422, 400, 400, 401, 401, 401];
    assert.deepEqual(
      errors.map((result) => result.status),
      expected,
    );
    for (const result of errors) {
      const body = apiErrorSchema.strict().parse(result.body);
      assert.ok(body.message.length > 0);
      assert.ok(!/stack|Error:|at /.test(result.text), result.text);
    }
  } finally {
    await api.close();
  }
});
