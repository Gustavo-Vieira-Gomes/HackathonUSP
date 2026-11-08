import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClinicProfile } from '@hackathon/contracts';
import { loadClinicPanel } from './clinic-panel';
import type { ClinicProfileResult } from './clinic-profile.service';

const profile: ClinicProfile = {
  id: '6f1c6c1e-2f7a-4a4e-9a51-0d0a7c2b1e01',
  name: 'Clínica Teste',
  address: 'Av. Paulista, 1000',
  latitude: -23.5617,
  longitude: -46.656,
  cnes: '1234567',
  technicalManager: 'Dra. Teste, CRM 123456',
  openingHours: [{ weekday: 1, startMinute: 480, endMinute: 1080 }],
};

test('HACK-51 - só 401 redireciona; API fora ou lenta mostra erro', async () => {
  for (const [result, expected] of [
    [
      { ok: false, status: 401 },
      { kind: 'redirect', to: '/clinica/login' },
    ],
    [{ ok: false, status: 403 }, { kind: 'not-clinic' }],
    [{ ok: false }, { kind: 'error' }],
    [{ ok: false, status: 500 }, { kind: 'error' }],
    [
      { ok: true, profile },
      { kind: 'profile', profile },
    ],
  ] as const) {
    let calls = 0;
    assert.deepEqual(
      await loadClinicPanel('c=1', {
        getClinicProfile: async (cookie): Promise<ClinicProfileResult> => {
          assert.equal(cookie, 'c=1');
          calls++;
          return result;
        },
      }),
      expected,
    );
    assert.equal(calls, 1);
  }
});
