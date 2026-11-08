import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { clinicSignUpResponseSchema } from '@hackathon/contracts';
import {
  clinicSignUpBody,
  randomCnes,
  signUp,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';

let t: TestApp;
before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.close();
});
const users = (email: string) => t.prisma.user.count({ where: { email } });
const clinics = (cnes: string) => t.prisma.clinic.count({ where: { cnes } });
async function signUpClinic(body: Record<string, unknown>) {
  const response = await signUp(t, 'clinica', body);
  return {
    response,
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

test('HACK-50 - conta clínica órfã recupera com senha válida, sem trocar identidade', async () => {
  const body = clinicSignUpBody(t.email());
  const created = await signUpClinic(body);
  assert.equal(created.status, 200);
  const first = clinicSignUpResponseSchema.parse(created.body);
  await t.prisma.clinic.delete({ where: { id: first.clinic.id } });
  const wrong = await signUpClinic({ ...body, password: 'senha-incorreta-1' });
  assert.equal(wrong.status, 422);
  assert.equal(await clinics(body.cnes as string), 0);
  const recovered = await signUpClinic(body);
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  const result = clinicSignUpResponseSchema.parse(recovered.body);
  assert.equal(result.user.id, first.user.id);
  assert.equal(await users(body.email as string), 1);
  assert.equal(await clinics(body.cnes as string), 1);
  const cookie = recovered.response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');
  const profile = await fetch(`${t.url}/api/clinic/me`, {
    headers: { cookie },
  });
  assert.equal(profile.status, 200);
  const complete = await signUpClinic({
    ...body,
    cnes: randomCnes(),
    name: 'Não sobrescrever',
  });
  assert.equal(complete.status, 422);
  assert.equal(
    (
      await t.prisma.clinic.findUniqueOrThrow({
        where: { id: result.clinic.id },
      })
    ).name,
    body.name,
  );
});

test('HACK-50 - senha válida de paciente não autoriza criar perfil de clínica', async () => {
  const body = clinicSignUpBody(t.email());
  const patient = await signUp(t, 'paciente', {
    name: body.name,
    email: body.email,
    password: body.password,
    phone: '+5511999999999',
    healthDataConsent: true,
  });
  assert.equal(patient.status, 200);
  assert.equal((await signUpClinic(body)).status, 422);
  assert.equal(await clinics(body.cnes as string), 0);
});
