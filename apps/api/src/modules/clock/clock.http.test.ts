import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';
import { DEMO_OPERATOR_TOKEN_HEADER as DEMO_CLOCK_TOKEN_HEADER } from '../../common/guards/demo-operator.guard';
import { ClockService } from './clock.service';

const TOKEN = 'token-do-operador-da-demo-com-32-chars';

let t: TestApp;
let off: TestApp;

before(async () => {
  t = await startTestApp({
    DEMO_CLOCK_ENABLED: 'true',
    DEMO_CLOCK_TOKEN: TOKEN,
  });
  off = await startTestApp();
  await t.app.get(ClockService).reset();
});

after(async () => {
  await t.app.get(ClockService).reset();
  await t.close();
  await off.close();
});

const call = (
  app: TestApp,
  method: string,
  body?: unknown,
  headers: Record<string, string> = { [DEMO_CLOCK_TOKEN_HEADER]: TOKEN },
) => jsonRequest(app, method, '/api/demo/clock', body, headers);

const advance = (minutes: number) =>
  call(t, 'POST', { advanceMinutes: minutes });

test('operador adianta 25 h: offset soma e now() anda junto', async () => {
  const before = Date.now();
  const first = await advance(25 * 60);
  assert.equal(first.status, 200);
  assert.equal(
    ((await first.json()) as { offsetMinutes: number }).offsetMinutes,
    1500,
  );
  const body = (await (await advance(60)).json()) as {
    offsetMinutes: number;
    now: string;
  };
  assert.equal(body.offsetMinutes, 1560);
  const shift = new Date(body.now).getTime() - before;
  assert.ok(
    shift >= 1560 * 60_000 && shift < 1561 * 60_000,
    `deslocamento ${shift}`,
  );
});

test('o deslocamento sobrevive a um restart: outra instância lê do banco', async () => {
  await t.app.get(ClockService).reset();
  await advance(90);
  assert.equal(await off.app.get(ClockService).refresh(), 90);
});

test('DELETE volta ao relógio real', async () => {
  await advance(30);
  const response = await call(t, 'DELETE');
  assert.equal(response.status, 200);
  assert.equal(
    ((await response.json()) as { offsetMinutes: number }).offsetMinutes,
    0,
  );
});

test('corpo inválido responde 400 e não mexe no relógio', async () => {
  await t.app.get(ClockService).reset();
  for (const body of [
    { advanceMinutes: 0 },
    { advanceMinutes: -10 },
    { minutes: 10 },
  ]) {
    assert.equal(
      (await call(t, 'POST', body)).status,
      400,
      JSON.stringify(body),
    );
  }
  assert.equal(await t.app.get(ClockService).refresh(), 0);
});

test('HACK-46: clínica logada sem token recebe 401 e o relógio não anda', async () => {
  await t.app.get(ClockService).reset();
  const clinic = await signUpWithCookie(t, 'clinica');
  const response = await call(
    t,
    'POST',
    { advanceMinutes: 43200 },
    { cookie: clinic.cookie },
  );
  assert.equal(response.status, 401);
  assert.equal(await t.app.get(ClockService).refresh(), 0);
});

test('HACK-46: token errado recebe 403 em todos os métodos e o relógio não anda', async () => {
  await t.app.get(ClockService).reset();
  for (const wrong of [`${TOKEN}x`, TOKEN.slice(0, -1), 'x'.repeat(40)]) {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const body = method === 'POST' ? { advanceMinutes: 43200 } : undefined;
      const response = await call(t, method, body, {
        [DEMO_CLOCK_TOKEN_HEADER]: wrong,
      });
      assert.equal(response.status, 403, `${method} ${wrong}`);
    }
  }
  assert.equal(await t.app.get(ClockService).refresh(), 0);
});

test('com a flag desligada a rota responde 404, até com um token', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    const body = method === 'POST' ? { advanceMinutes: 10 } : undefined;
    assert.equal((await call(off, method, body)).status, 404, method);
  }
  assert.equal((await call(off, 'GET', undefined, {})).status, 404);
});
