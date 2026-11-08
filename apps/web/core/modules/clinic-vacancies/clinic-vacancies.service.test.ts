import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startFakeApi } from '@/core/shared/services/fake-api.test-helper';
import { getClinicVacancies } from './clinic-vacancies.service';

test('H20 leitura encaminha sessão, valida resposta e preserva indisponibilidade', async () => {
  const data = {
    now: '2026-11-08T17:16:00.000Z',
    vacancies: [],
    reservations: [],
  };
  for (const body of [data, { ...data, reservations: [{}] }]) {
    const api = await startFakeApi(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    try {
      assert.deepEqual(
        await getClinicVacancies('session=x', { baseUrl: api.url }),
        body === data ? { ok: true, data } : { ok: false },
      );
      assert.equal(api.requests[0]?.headers.cookie, 'session=x');
      assert.equal(api.requests[0]?.url, '/api/clinic/vacancies');
    } finally {
      await api.close();
    }
  }
  const api = await startFakeApi(() => ({ status: 503 }));
  try {
    assert.deepEqual(await getClinicVacancies('', { baseUrl: api.url }), {
      ok: false,
    });
  } finally {
    await api.close();
  }
});
