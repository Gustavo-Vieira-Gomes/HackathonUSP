import assert from 'node:assert/strict';
import { request } from 'node:http';
import { after, before, mock, test } from 'node:test';
import { Logger } from '@nestjs/common';
import type { Socket } from 'socket.io-client';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';
import {
  closeAll,
  connect,
  connectError,
  generateToken,
  namespaceSize,
  serverRooms,
} from './realtime.test-helper';

let t: TestApp;
const abertos: Socket[] = [];
before(async () => {
  t = await startTestApp();
});
after(async () => {
  closeAll(abertos);
  await t.close();
});

async function conectar(
  ...args: Parameters<typeof connect> extends [TestApp, ...infer R] ? R : never
): Promise<Socket> {
  const socket = await connect(t, ...args);
  abertos.push(socket);
  return socket;
}

function adulterar(valor: string): string {
  const ultimo = valor.at(-1) === 'A' ? 'B' : 'A';
  return `${valor.slice(0, -1)}${ultimo}`;
}

async function signOut(cookie: string): Promise<void> {
  const response = await jsonRequest(
    t,
    'POST',
    '/api/auth/sign-out',
    {},
    {
      cookie,
    },
  );
  assert.equal(response.status, 200);
}

test('C2 - token de paciente conecta e fica só em paciente:<id>', async () => {
  const conta = await signUpWithCookie(t, 'paciente');
  const socket = await conectar({
    token: await generateToken(t, conta.cookie),
  });
  assert.deepEqual(
    serverRooms(t, socket),
    new Set([socket.id, `paciente:${conta.id}`]),
  );
});

test('C3 - token de clínica conecta e fica só em clinica:<id>', async () => {
  const conta = await signUpWithCookie(t, 'clinica');
  const socket = await conectar({
    token: await generateToken(t, conta.cookie),
  });
  assert.deepEqual(
    serverRooms(t, socket),
    new Set([socket.id, `clinica:${conta.id}`]),
  );
});

test('C4 - token adulterado, expirado ou ruim com cookie bom recebe unauthorized', async () => {
  const antes = namespaceSize(t);

  const adulterado = await signUpWithCookie(t, 'paciente');
  const tokenAdulterado = adulterar(await generateToken(t, adulterado.cookie));
  assert.equal(
    await connectError(t, { token: tokenAdulterado }),
    'unauthorized',
    'token adulterado',
  );

  const expirado = await signUpWithCookie(t, 'paciente');
  const tokenExpirado = await generateToken(t, expirado.cookie);
  const sessao = await t.prisma.session.findFirstOrThrow({
    where: { userId: expirado.id },
  });
  const movidas = await t.prisma.verification.updateMany({
    where: {
      identifier: { startsWith: 'one-time-token:' },
      value: sessao.token,
    },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(movidas.count, 1);
  assert.equal(
    await connectError(t, { token: tokenExpirado }),
    'unauthorized',
    'token expirado',
  );

  const comCookie = await signUpWithCookie(t, 'clinica');
  const tokenRuim = adulterar(await generateToken(t, comCookie.cookie));
  assert.equal(
    await connectError(t, { token: tokenRuim, cookie: comCookie.cookie }),
    'unauthorized',
    'token ruim com cookie bom não cai no cookie',
  );

  assert.equal(namespaceSize(t), antes);
});

test('C5 - o mesmo token num segundo handshake recebe unauthorized', async () => {
  const conta = await signUpWithCookie(t, 'paciente');
  const token = await generateToken(t, conta.cookie);
  await conectar({ token });
  assert.equal(await connectError(t, { token }), 'unauthorized');
});

test('C6 - só com cookie válido conecta na sala do papel', async () => {
  for (const role of ['paciente', 'clinica'] as const) {
    const conta = await signUpWithCookie(t, role);
    const socket = await conectar({ cookie: conta.cookie });
    assert.deepEqual(
      serverRooms(t, socket),
      new Set([socket.id, `${role}:${conta.id}`]),
      role,
    );
  }
});

test('C7 - sem token: sem cookie, cookie adulterado ou sessão encerrada recebe unauthorized', async () => {
  assert.equal(await connectError(t), 'unauthorized', 'sem cookie');

  const adulterado = await signUpWithCookie(t, 'paciente');
  assert.equal(
    await connectError(t, { cookie: adulterar(adulterado.cookie) }),
    'unauthorized',
    'cookie adulterado',
  );

  const encerrado = await signUpWithCookie(t, 'paciente');
  await signOut(encerrado.cookie);
  assert.equal(
    await connectError(t, { cookie: encerrado.cookie }),
    'unauthorized',
    'sessão encerrada',
  );
});

test('C8 - falha inesperada na verificação recebe unavailable e o log não leva token, cookie nem e-mail', async () => {
  const conta = await signUpWithCookie(t, 'paciente');
  const token = await generateToken(t, conta.cookie);
  const cookieValor = conta.cookie.split('=').slice(1).join('=');
  const falha = async (): Promise<never> => {
    throw new Error('db down');
  };
  const verify = mock.method(t.sessions, 'verifyOneTimeToken', falha);
  const getSession = mock.method(t.sessions, 'getSession', falha);
  const log = mock.method(Logger.prototype, 'error', () => undefined);
  try {
    assert.equal(await connectError(t, { token }), 'unavailable', 'token');
    assert.equal(log.mock.callCount(), 1, 'um erro por handshake (token)');
    assert.equal(
      await connectError(t, { cookie: conta.cookie }),
      'unavailable',
      'cookie',
    );
    assert.equal(log.mock.callCount(), 2, 'um erro por handshake (cookie)');
    const texto = log.mock.calls
      .flatMap((call) => call.arguments.map((arg) => String(arg)))
      .join('\n');
    assert.ok(!texto.includes(token), 'log com token');
    assert.ok(!texto.includes(cookieValor), 'log com cookie');
    assert.ok(!texto.includes(conta.email), 'log com e-mail');
  } finally {
    verify.mock.restore();
    getSession.mock.restore();
    log.mock.restore();
  }
});

function upgradeStatus(origin: string | null, cookie: string): Promise<number> {
  const url = new URL('/socket.io/?EIO=4&transport=websocket', t.url);
  return new Promise((resolve, reject) => {
    const req = request(url, {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
        cookie,
        ...(origin === null ? {} : { origin }),
      },
    });
    req.on('upgrade', (response, socket) => {
      socket.destroy();
      resolve(response.statusCode ?? 101);
    });
    req.on('response', (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

test('C9 - origem diferente ou ausente: 403 no polling e 400 no upgrade, sem conexão; WEB_ORIGIN conecta', async () => {
  const conta = await signUpWithCookie(t, 'paciente');
  for (const origin of ['http://evil.example', null]) {
    const polling = await fetch(`${t.url}/socket.io/?EIO=4&transport=polling`, {
      headers: {
        cookie: conta.cookie,
        ...(origin === null ? {} : { origin }),
      },
    });
    assert.equal(polling.status, 403, `polling, origem ${origin}`);
    assert.equal(
      await upgradeStatus(origin, conta.cookie),
      400,
      `websocket, origem ${origin}`,
    );
    assert.notEqual(
      await connectError(t, {
        token: await generateToken(t, conta.cookie),
        cookie: conta.cookie,
        origin,
      }),
      'conectou',
      `cliente socket.io, origem ${origin}`,
    );
  }
  assert.equal(await upgradeStatus(t.env.WEB_ORIGIN, conta.cookie), 101);
  const aceito = await conectar({
    token: await generateToken(t, conta.cookie),
    cookie: conta.cookie,
  });
  assert.ok(aceito.connected);
});

test('C10 - ids enviados pelo cliente em auth e query não mudam a sala', async () => {
  const paciente = await signUpWithCookie(t, 'paciente');
  const outro = await signUpWithCookie(t, 'paciente');
  const clinica = await signUpWithCookie(t, 'clinica');
  const socket = await conectar({
    token: await generateToken(t, paciente.cookie),
    auth: {
      userId: outro.id,
      role: 'clinica',
      room: `clinica:${clinica.id}`,
    },
    query: { userId: outro.id, room: 'clinica:x' },
  });
  assert.deepEqual(
    serverRooms(t, socket),
    new Set([socket.id, `paciente:${paciente.id}`]),
  );
});
