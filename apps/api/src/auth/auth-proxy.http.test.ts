import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonRequest, startTestApp } from '../testing/test-app';

test('R2 - cadastro e login persistem só o IP autenticado, não headers públicos', async () => {
  const key = 'b'.repeat(64);
  const t = await startTestApp({ AUTH_PROXY_SECRET: key });
  try {
    const body = {
      name: 'Proxy test',
      email: t.email(),
      password: 'test-password',
    };
    const headers = {
      'x-hackathon-proxy-key': key,
      'x-hackathon-client-ip': '198.51.100.70',
      'x-forwarded-for': '203.0.113.99',
    };
    const signup = await jsonRequest(
      t,
      'POST',
      '/api/sign-up/paciente',
      body,
      headers,
    );
    assert.equal(signup.status, 200);
    const direct = await jsonRequest(t, 'POST', '/api/sign-up/paciente', {
      ...body,
      email: t.email(),
    });
    assert.equal(direct.status, 403);
    assert.equal(
      await t.prisma.user.count({ where: { email: body.email } }),
      1,
    );
    const login = await jsonRequest(
      t,
      'POST',
      '/api/auth/sign-in/email',
      { email: body.email, password: body.password },
      {
        ...headers,
        'x-hackathon-client-ip': '198.51.100.71',
      },
    );
    assert.equal(login.status, 200);
    const sessions = await t.prisma.session.findMany({
      where: { user: { email: body.email } },
      select: { ipAddress: true },
    });
    assert.deepEqual(sessions.map((session) => session.ipAddress).sort(), [
      '198.51.100.70',
      '198.51.100.71',
    ]);
  } finally {
    await t.close();
  }
});

test('R2 - Better Auth limita login pelo IP autenticado, sem evasão via XFF nem balde único', async () => {
  const key = 'a'.repeat(64);
  const t = await startTestApp({ AUTH_PROXY_SECRET: key });
  try {
    const login = (ip: string, forged: string) =>
      jsonRequest(
        t,
        'POST',
        '/api/auth/sign-in/email',
        {
          email: t.email(),
          password: 'wrong-password',
        },
        {
          'x-hackathon-proxy-key': key,
          'x-hackathon-client-ip': ip,
          'x-forwarded-for': forged,
          'x-real-ip': forged,
          'x-vercel-forwarded-for': forged,
        },
      );
    for (let i = 0; i < 3; i++) {
      assert.equal(
        (await login('198.51.100.80', `203.0.113.${i + 1}`)).status,
        401,
      );
    }
    const blocked = await login('198.51.100.80', '203.0.113.99');
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('retry-after'));
    assert.equal((await login('198.51.100.81', '203.0.113.99')).status, 401);
    assert.equal((await login('2001:db8:22::1', '203.0.113.99')).status, 401);
    const direct = await jsonRequest(
      t,
      'POST',
      '/api/auth/sign-in/email',
      {},
      { 'x-hackathon-client-ip': '198.51.100.82' },
    );
    assert.equal(direct.status, 403);
  } finally {
    await t.close();
  }
});
