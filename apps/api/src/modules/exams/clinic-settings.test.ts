import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { clinicSettingsSchema } from '@hackathon/contracts';
import {
  jsonRequest,
  signUpWithCookie,
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

async function newClinic() {
  const account = await signUpWithCookie(t, 'clinica');
  assert.ok(account.clinicId);
  return { cookie: account.cookie, clinicId: account.clinicId };
}

const stored = (clinicId: string) =>
  t.prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { depositPercent: true, dailyDiscountCap: true },
  });

test('H17-C18 - clínica nova lê sinal 20 e teto 5', async () => {
  const clinic = await newClinic();
  const response = await jsonRequest(
    t,
    'GET',
    '/api/clinic/settings',
    undefined,
    {
      cookie: clinic.cookie,
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(clinicSettingsSchema.parse(await response.json()), {
    depositPercent: 20,
    dailyDiscountCap: 5,
  });
});

test('H17-C19 - PATCH grava sinal e teto só na clínica da sessão', async () => {
  const a = await newClinic();
  const b = await newClinic();
  const response = await jsonRequest(
    t,
    'PATCH',
    '/api/clinic/settings',
    { depositPercent: 25, dailyDiscountCap: 3 },
    { cookie: a.cookie },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    depositPercent: 25,
    dailyDiscountCap: 3,
  });
  assert.deepEqual(await stored(a.clinicId), {
    depositPercent: 25,
    dailyDiscountCap: 3,
  });
  assert.deepEqual(await stored(b.clinicId), {
    depositPercent: 20,
    dailyDiscountCap: 5,
  });
});

test('H17-C20 - sinal zero e campo extra respondem 422 com o campo e não gravam', async () => {
  const clinic = await newClinic();
  const cases: [Record<string, unknown>, string][] = [
    [{ depositPercent: 0, dailyDiscountCap: 3 }, 'depositPercent'],
    [
      { depositPercent: 30, dailyDiscountCap: 3, clinicId: clinic.clinicId },
      'clinicId',
    ],
  ];
  for (const [body, field] of cases) {
    const response = await jsonRequest(
      t,
      'PATCH',
      '/api/clinic/settings',
      body,
      {
        cookie: clinic.cookie,
      },
    );
    assert.equal(response.status, 422, field);
    const error = (await response.json()) as { code: string; fields: string[] };
    assert.equal(error.code, 'VALIDATION_FAILED');
    assert.ok(error.fields.includes(field), field);
  }
  assert.deepEqual(await stored(clinic.clinicId), {
    depositPercent: 20,
    dailyDiscountCap: 5,
  });
});
