import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getPatientReservation,
  getPatientSubscription,
} from './patient-record.service';

const reservation = {
  id: '6f1c6c1e-2f7a-4a4e-9a51-0d0a7c2b1e01',
  state: 'confirmada',
  type: 'comum',
  chargedPriceCents: 10000,
  depositCents: 0,
  paymentMethod: 'no_local',
  slot: {
    startsAt: '2026-11-08T12:00:00.000Z',
    endsAt: '2026-11-08T13:00:00.000Z',
    exam: { name: 'Exame teste' },
  },
};
const options = { baseUrl: 'http://127.0.0.1:3001' };

test('404 descarta corpo de outro paciente; erro, sessão expirada e contrato inválido não viram registro', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(reservation, { status: 404 }),
  );
  assert.deepEqual(
    await getPatientReservation('outro', 'session=Maria', options),
    { kind: 'not-found' },
  );
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { status: 401 }),
  );
  assert.deepEqual(await getPatientSubscription('outro', '', options), {
    kind: 'unauthenticated',
  });
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ id: 'malformed' }),
  );
  assert.deepEqual(await getPatientReservation('id', 'c=1', options), {
    kind: 'error',
  });
  t.mock.method(globalThis, 'fetch', async () => {
    throw new DOMException('timeout', 'TimeoutError');
  });
  assert.deepEqual(await getPatientReservation('id', 'c=1', options), {
    kind: 'error',
  });
});

test('repassa cookie sem cache e valida resposta antes de exibir', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/api/patient/reservations/id');
      assert.equal(new Headers(init?.headers).get('cookie'), 'session=Maria');
      assert.equal(init?.cache, 'no-store');
      assert.ok(init?.signal);
      return Response.json(reservation);
    },
  );
  assert.deepEqual(
    await getPatientReservation('id', 'session=Maria', options),
    { kind: 'ok', record: reservation },
  );
});
