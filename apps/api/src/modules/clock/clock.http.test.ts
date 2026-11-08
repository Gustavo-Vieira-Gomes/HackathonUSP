import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';
import { ClockService } from './clock.service';

let t: TestApp;
let off: TestApp;
let clinic: string;
let patient: string;

before(async () => {
  t = await startTestApp({ DEMO_CLOCK_ENABLED: 'true' });
  off = await startTestApp();
  clinic = (await signUpWithCookie(t, 'clinica')).cookie;
  patient = (await signUpWithCookie(t, 'paciente')).cookie;
  await t.app.get(ClockService).reset();
});

after(async () => {
  await t.app.get(ClockService).reset();
  await t.close();
  await off.close();
});

const advance = (cookie: string, body: unknown) =>
  jsonRequest(t, 'POST', '/api/demo/clock', body, { cookie });

test('clínica adianta 25 h: offset soma e now() anda junto', async () => {
  const clock = t.app.get(ClockService);
  const before = Date.now();
  const first = await advance(clinic, { advanceMinutes: 25 * 60 });
  assert.equal(first.status, 200);
  assert.equal(
    ((await first.json()) as { offsetMinutes: number }).offsetMinutes,
    1500,
  );
  const second = await advance(clinic, { advanceMinutes: 60 });
  const body = (await second.json()) as { offsetMinutes: number; now: string };
  assert.equal(body.offsetMinutes, 1560);
  const shift = new Date(body.now).getTime() - before;
  assert.ok(
    shift >= 1560 * 60_000 && shift < 1561 * 60_000,
    `deslocamento ${shift}`,
  );
  assert.ok(clock.now().getTime() - Date.now() >= 1560 * 60_000 - 1_000);
});

test('o deslocamento sobrevive a um restart: outra instância lê do banco', async () => {
  await t.app.get(ClockService).reset();
  await advance(clinic, { advanceMinutes: 90 });
  const otherInstance = off.app.get(ClockService);
  assert.equal(await otherInstance.refresh(), 90);
});

test('DELETE volta ao relógio real', async () => {
  await advance(clinic, { advanceMinutes: 30 });
  const response = await jsonRequest(
    t,
    'DELETE',
    '/api/demo/clock',
    undefined,
    {
      cookie: clinic,
    },
  );
  assert.equal(response.status, 200);
  assert.equal(
    ((await response.json()) as { offsetMinutes: number }).offsetMinutes,
    0,
  );
  assert.equal(t.app.get(ClockService).offsetMinutes(), 0);
});

test('corpo inválido responde 400 e não mexe no relógio', async () => {
  await t.app.get(ClockService).reset();
  for (const body of [
    { advanceMinutes: 0 },
    { advanceMinutes: -10 },
    { minutes: 10 },
  ]) {
    const response = await advance(clinic, body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(await t.app.get(ClockService).refresh(), 0);
});

test('sem sessão responde 401; paciente responde 403', async () => {
  assert.equal((await jsonRequest(t, 'GET', '/api/demo/clock')).status, 401);
  assert.equal((await advance(patient, { advanceMinutes: 10 })).status, 403);
});

test('com a flag desligada a rota responde 404, até para clínica logada', async () => {
  const cookie = (await signUpWithCookie(off, 'clinica')).cookie;
  for (const method of ['GET', 'POST', 'DELETE']) {
    const body = method === 'POST' ? { advanceMinutes: 10 } : undefined;
    const response = await jsonRequest(off, method, '/api/demo/clock', body, {
      cookie,
    });
    assert.equal(response.status, 404, method);
  }
  assert.equal((await jsonRequest(off, 'GET', '/api/demo/clock')).status, 404);
});
