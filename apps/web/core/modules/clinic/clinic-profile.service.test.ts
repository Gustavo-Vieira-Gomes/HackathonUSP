import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closedPortUrl,
  startFakeApi,
} from '@/core/shared/services/fake-api.test-helper';
import {
  CLINIC_PROFILE_TIMEOUT_MS,
  getClinicProfile,
} from './clinic-profile.service';

const profile = {
  id: '6f1c6c1e-2f7a-4a4e-9a51-0d0a7c2b1e01',
  name: 'Clínica Teste',
  address: 'Av. Paulista, 1000',
  latitude: -23.5617,
  longitude: -46.656,
  cnes: '1234567',
  technicalManager: 'Dra. Teste, CRM 123456',
  openingHours: [{ weekday: 1, startMinute: 480, endMinute: 1080 }],
};

const jsonReply = (status: number, body: unknown) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('H16-C30 - 500, timeout, corpo fora do contrato e rede viram indisponível; corpo válido vira perfil', async () => {
  assert.equal(CLINIC_PROFILE_TIMEOUT_MS, 5000);
  const failing = [
    await startFakeApi(() => jsonReply(500, {})),
    await startFakeApi(() => null),
    await startFakeApi(() => jsonReply(200, { ...profile, cnes: undefined })),
  ];
  try {
    for (const api of failing) {
      const result = await getClinicProfile('c=1', {
        baseUrl: api.url,
        timeoutMs: 200,
      });
      assert.deepEqual(result, { ok: false });
    }
    assert.deepEqual(
      await getClinicProfile('c=1', { baseUrl: await closedPortUrl() }),
      { ok: false },
    );
  } finally {
    await Promise.all(failing.map((api) => api.close()));
  }

  const ok = await startFakeApi(() => jsonReply(200, profile));
  try {
    const result = await getClinicProfile('c=1', { baseUrl: ok.url });
    assert.deepEqual(result, { ok: true, profile });
    assert.equal(ok.requests[0]?.url, '/api/clinic/me');
    assert.equal(ok.requests[0]?.headers.cookie, 'c=1');
  } finally {
    await ok.close();
  }
});
