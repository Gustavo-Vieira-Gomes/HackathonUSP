import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// Compilado em .test-dist/config/boot.test.js; o main compilado fica em .test-dist/main.js.
const mainJs = join(__dirname, '..', 'main.js');

const values = {
  DATABASE_URL: 'postgresql://usuario:senha-db-boot@127.0.0.1:5999/banco',
  BETTER_AUTH_SECRET: 'segredo-de-boot-com-mais-de-32-caracteres',
  BETTER_AUTH_URL: 'http://127.0.0.1:3999',
  WEB_ORIGIN: 'http://127.0.0.1:3998',
};

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function boot(env: Record<string, string>) {
  const port = await freePort();
  // Diretório vazio: sem .env para o main carregar.
  const cwd = mkdtempSync(join(tmpdir(), 'hack12-boot-'));
  const child = spawn(process.execPath, [mainJs], {
    cwd,
    env: {
      PATH: process.env.PATH ?? '',
      PORT: String(port),
      HOST: '127.0.0.1',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  const [code] = (await once(child, 'exit')) as [number | null];
  clearTimeout(timer);
  const listening = await new Promise<boolean>((resolve) => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });
  return { code, output, listening };
}

test('C4 - main.js sem BETTER_AUTH_SECRET sai com 1, cita o nome, não vaza valores e não abre a porta', async () => {
  const env: Record<string, string> = { ...values };
  delete env.BETTER_AUTH_SECRET;
  const result = await boot(env);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /BETTER_AUTH_SECRET/);
  for (const value of Object.values(values)) {
    assert.equal(
      result.output.includes(value),
      false,
      'vazou valor de variável',
    );
  }
  assert.equal(result.listening, false);
});

test('C5 - main.js com BETTER_AUTH_SECRET de 31 caracteres sai com 1', async () => {
  const result = await boot({ ...values, BETTER_AUTH_SECRET: 'b'.repeat(31) });
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /BETTER_AUTH_SECRET/);
  assert.equal(result.output.includes('b'.repeat(31)), false);
  assert.equal(result.listening, false);
});

test('C9 - main.js com o BETTER_AUTH_SECRET de exemplo sai com 1, cita o nome, não vaza o valor e não abre a porta', async () => {
  const placeholder = 'troque-por-um-segredo-local-de-32-caracteres';
  const result = await boot({ ...values, BETTER_AUTH_SECRET: placeholder });
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /BETTER_AUTH_SECRET/);
  assert.equal(result.output.includes(placeholder), false);
  assert.equal(result.listening, false);
});
