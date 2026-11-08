import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { authProxyMiddleware } from './auth-proxy.middleware';
import type { AppEnv } from '../config/env';

const secret = 'a'.repeat(64);
const env: AppEnv = {
  DATABASE_URL: 'postgresql://local/test',
  BETTER_AUTH_SECRET: 'test'.repeat(8),
  BETTER_AUTH_URL: 'https://api.example.test',
  WEB_ORIGIN: 'https://web.example.test',
  AUTH_PROXY_SECRET: secret,
};

async function withServer(config: AppEnv, run: (url: string) => Promise<void>) {
  const middleware = authProxyMiddleware(config);
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          ip: req.headers['x-hackathon-client-ip'] ?? null,
          credential: req.headers['x-hackathon-proxy-key'] ?? null,
        }),
      );
    }),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test('R2 - acesso direto ao Nest não consegue forjar origem, chave ou IP', async () => {
  await withServer(env, async (url) => {
    for (const path of [
      '/api/auth/sign-in/email',
      '/api/auth',
      '/api/sign-up/paciente',
      '/API/AUTH/sign-in/email',
      '/api/%61uth/sign-in/email',
    ]) {
      for (const key of [undefined, 'wrong', 'b'.repeat(64)]) {
        const headers: Record<string, string> = {
          'x-hackathon-client-ip': '198.51.100.10',
          'x-forwarded-for': '198.51.100.10',
          'x-vercel-forwarded-for': '198.51.100.10',
        };
        if (key) headers['x-hackathon-proxy-key'] = key;
        assert.equal((await fetch(url + path, { headers })).status, 403);
      }
    }
    for (const ip of ['', 'invalid', '198.51.100.1, 198.51.100.2']) {
      assert.equal(
        (
          await fetch(url + '/api/auth/sign-in/email', {
            headers: {
              'x-hackathon-proxy-key': secret,
              'x-hackathon-client-ip': ip,
            },
          })
        ).status,
        400,
      );
    }
    assert.equal((await fetch(url + '/api/health')).status, 200);
  });
});

test('R2 - IP autenticado preserva IPv4/IPv6, remove chave e não confia em XFF', async () => {
  await withServer(env, async (url) => {
    for (const ip of ['198.51.100.10', '2001:db8::1']) {
      const response = await fetch(url + '/api/auth/sign-in/email', {
        headers: {
          'x-hackathon-proxy-key': secret,
          'x-hackathon-client-ip': ip,
          'x-forwarded-for': '203.0.113.10, 203.0.113.11',
        },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ip, credential: null });
    }
    const health = await fetch(url + '/api/health', {
      headers: {
        'x-hackathon-proxy-key': secret,
        'x-hackathon-client-ip': '198.51.100.10',
      },
    });
    assert.deepEqual(await health.json(), { ip: null, credential: null });
  });
});

test('R2 - desenvolvimento ignora IP recebido e usa o peer da conexão', async () => {
  await withServer({ ...env, AUTH_PROXY_SECRET: undefined }, async (url) => {
    const response = await fetch(url + '/api/auth/sign-in/email', {
      headers: {
        'x-forwarded-for': '203.0.113.10',
        'x-hackathon-client-ip': '203.0.113.11',
        'x-hackathon-proxy-key': secret,
      },
    });
    assert.deepEqual(await response.json(), {
      ip: '127.0.0.1',
      credential: null,
    });
  });
});
