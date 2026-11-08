import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  type FakeReply,
  startFakeApi,
} from '../../shared/services/fake-api.test-helper';
import {
  selectGoogleCalendar,
  startGoogleCalendarConnect,
} from './clinic-calendar.service';

const COOKIE = 'better-auth.session_token=abc.def';
let reply: FakeReply = { status: 500 };
let api: Awaited<ReturnType<typeof startFakeApi>>;
let options: { baseUrl: string };
before(async () => {
  api = await startFakeApi(() => reply);
  options = { baseUrl: api.url };
});
after(() => api.close());

const json = (status: number, body: unknown): FakeReply => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('H18-C19 - conectar: 200 no contrato devolve a URL; 503 indisponível; fora do contrato é erro sem URL', async () => {
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?state=abc';
  reply = json(200, { authorizationUrl: url });
  assert.deepEqual(await startGoogleCalendarConnect(COOKIE, options), {
    kind: 'redirect',
    url,
  });
  const last = api.requests.at(-1);
  assert.equal(last?.method, 'POST');
  assert.equal(last?.url, '/api/clinic/google-calendar/connect');
  assert.equal(last?.headers.cookie, COOKIE);

  reply = json(503, { code: 'GOOGLE_CALENDAR_UNAVAILABLE', message: 'x' });
  assert.deepEqual(await startGoogleCalendarConnect(COOKIE, options), {
    kind: 'unavailable',
  });

  for (const body of [{}, { authorizationUrl: 'nao-e-url' }]) {
    reply = json(200, body);
    assert.deepEqual(await startGoogleCalendarConnect(COOKIE, options), {
      kind: 'error',
    });
  }
});

test('H18-C31 - escolher: PUT com calendarId e cookie; só 200 no contrato é sucesso; 409, 422 e 502/504 devolvem o code', async () => {
  reply = json(200, {
    status: 'connected',
    calendarName: 'Exames',
    connectedAt: '2026-11-08T12:00:00.000Z',
  });
  assert.deepEqual(await selectGoogleCalendar(COOKIE, 'exames@x', options), {
    ok: true,
  });
  const last = api.requests.at(-1);
  assert.equal(last?.method, 'PUT');
  assert.equal(last?.url, '/api/clinic/google-calendar/calendar');
  assert.equal(last?.headers.cookie, COOKIE);
  assert.deepEqual(JSON.parse(last?.body ?? ''), { calendarId: 'exames@x' });

  const failures: [number, string][] = [
    [409, 'CALENDAR_NOT_AUTHORIZED'],
    [422, 'CALENDAR_NOT_AVAILABLE'],
    [422, 'VALIDATION_FAILED'],
    [502, 'GOOGLE_UNAVAILABLE'],
    [504, 'GOOGLE_TIMEOUT'],
  ];
  for (const [status, code] of failures) {
    reply = json(status, { code, message: 'x' });
    assert.deepEqual(
      await selectGoogleCalendar(COOKIE, 'exames@x', options),
      { ok: false, code },
      code,
    );
  }
  reply = json(200, { status: 'conectada' });
  assert.equal((await selectGoogleCalendar(COOKIE, 'x', options)).ok, false);
});
