import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClinicProfile, SessionUser } from '@hackathon/contracts';
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

const user = (role: SessionUser['role']): SessionUser => ({
  id: 'u1',
  name: 'Fulana',
  email: 'fulana@teste.local',
  role,
});

function deps(
  session: SessionUser | null,
  result: ClinicProfileResult = { ok: true, profile },
) {
  let profileCalls = 0;
  return {
    calls: () => profileCalls,
    deps: {
      getSessionUser: async () => session,
      getClinicProfile: async () => {
        profileCalls++;
        return result;
      },
    },
  };
}

test('H16-C29 - painel decide sem sessão, paciente, clínica com perfil e perfil indisponível', async () => {
  const anonymous = deps(null);
  assert.deepEqual(await loadClinicPanel('', anonymous.deps), {
    kind: 'redirect',
    to: '/clinica/login',
  });
  assert.equal(anonymous.calls(), 0);

  const patient = deps(user('paciente'));
  assert.equal((await loadClinicPanel('c=1', patient.deps)).kind, 'not-clinic');
  assert.equal(patient.calls(), 0, 'paciente não chama /api/clinic/me');

  const clinic = deps(user('clinica'));
  assert.deepEqual(await loadClinicPanel('c=1', clinic.deps), {
    kind: 'profile',
    profile,
  });
  assert.equal(clinic.calls(), 1);

  const failing = deps(user('clinica'), { ok: false });
  assert.deepEqual(await loadClinicPanel('c=1', failing.deps), {
    kind: 'error',
  });
});
