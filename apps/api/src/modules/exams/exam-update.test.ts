import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { examSchema } from '@hackathon/contracts';
import {
  deleteExamsOf,
  examBody,
  examSnapshot,
  examUpdateBody,
  THYROID,
} from '../../testing/exam-fixtures';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';

type Clinic = { cookie: string; clinicId: string };

let t: TestApp;
let a: Clinic;
let b: Clinic;
const clinicIds: string[] = [];

async function newClinic(): Promise<Clinic> {
  const account = await signUpWithCookie(t, 'clinica');
  assert.ok(account.clinicId);
  clinicIds.push(account.clinicId);
  return { cookie: account.cookie, clinicId: account.clinicId };
}

before(async () => {
  t = await startTestApp();
  a = await newClinic();
  b = await newClinic();
});

after(async () => {
  await deleteExamsOf(t.prisma, clinicIds);
  await t.close();
});

async function createExam(
  clinic: Clinic,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await jsonRequest(
    t,
    'POST',
    '/api/clinic/exams',
    examBody(overrides),
    { cookie: clinic.cookie },
  );
  assert.equal(response.status, 201, await response.clone().text());
  return examSchema.parse(await response.json()).id;
}

/** Exame novo de RM numa clínica nova, para cada teste partir do mesmo estado. */
async function freshExam(overrides: Record<string, unknown> = {}) {
  const clinic = await newClinic();
  const id = await createExam(clinic, overrides);
  return { clinic, id };
}

const put = (cookie: string, id: string, body: unknown) =>
  jsonRequest(t, 'PUT', `/api/clinic/exams/${id}`, body, { cookie });

const NOT_FOUND = { code: 'NOT_FOUND', message: 'Exame não encontrado.' };

test('H17-C21 - edição válida responde 200 com os valores novos, mesmo TUSS e só os degraus enviados', async () => {
  const { clinic, id } = await freshExam();
  const beforeEdit = await examSnapshot(t.prisma, id);
  const body = examUpdateBody({
    fullPriceCents: 80000,
    floorPriceCents: 55000,
    toleranceMinutes: 20,
    maxTravelMinutes: 60,
    priceSteps: [
      { leadMinutes: 2880, discountPercent: 15 },
      { leadMinutes: 360, discountPercent: 35 },
    ],
  });
  const response = await put(clinic.cookie, id, body);
  assert.equal(response.status, 200);
  const exam = examSchema.parse(await response.json());
  assert.equal(exam.id, id);
  assert.equal(exam.tussCode, beforeEdit.tussCode);
  assert.equal(exam.name, beforeEdit.name);
  assert.equal(exam.fullPriceCents, 80000);
  assert.equal(exam.floorPriceCents, 55000);
  assert.equal(exam.toleranceMinutes, 20);
  assert.equal(exam.maxTravelMinutes, 60);
  assert.deepEqual(exam.priceSteps, [
    { leadMinutes: 2880, discountPercent: 15 },
    { leadMinutes: 360, discountPercent: 35 },
  ]);
  const afterEdit = await examSnapshot(t.prisma, id);
  assert.equal(afterEdit.questionnaireKey, beforeEdit.questionnaireKey);
  assert.equal(afterEdit.questionnaireVersion, beforeEdit.questionnaireVersion);
  assert.deepEqual(afterEdit.priceSteps, exam.priceSteps);

  const again = await put(clinic.cookie, id, body);
  assert.equal(again.status, 200);
  assert.deepEqual((await examSnapshot(t.prisma, id)).priceSteps, [
    { leadMinutes: 2880, discountPercent: 15 },
    { leadMinutes: 360, discountPercent: 35 },
  ]);
});

test('H17-C22 - piso acima do preço na edição responde 422 e não altera o exame', async () => {
  const { clinic, id } = await freshExam();
  const beforeEdit = await examSnapshot(t.prisma, id);
  const response = await put(
    clinic.cookie,
    id,
    examUpdateBody({ fullPriceCents: 80000, floorPriceCents: 90000 }),
  );
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    code: 'FLOOR_ABOVE_FULL_PRICE',
    message: 'piso deve ser menor ou igual ao preço cheio',
    fields: ['floorPriceCents'],
  });
  assert.deepEqual(await examSnapshot(t.prisma, id), beforeEdit);
});

test('H17-C23 - Y zero na edição responde 422 com o campo e não altera o exame', async () => {
  const { clinic, id } = await freshExam();
  const beforeEdit = await examSnapshot(t.prisma, id);
  const response = await put(
    clinic.cookie,
    id,
    examUpdateBody({ maxTravelMinutes: 0 }),
  );
  assert.equal(response.status, 422);
  const body = (await response.json()) as { code: string; fields: string[] };
  assert.equal(body.code, 'VALIDATION_FAILED');
  assert.ok(body.fields.includes('maxTravelMinutes'));
  assert.deepEqual(await examSnapshot(t.prisma, id), beforeEdit);
});

test('H17-C24 - campo imutável ou fora do contrato na edição responde 422 e não altera o exame', async () => {
  const { clinic, id } = await freshExam();
  const beforeEdit = await examSnapshot(t.prisma, id);
  const extras: Record<string, unknown> = {
    tussCode: THYROID(),
    clinicId: b.clinicId,
    name: 'Outro nome',
    questionnaireKey: 'us-thyroid',
    questionnaireVersion: 2,
  };
  for (const [field, value] of Object.entries(extras)) {
    const response = await put(
      clinic.cookie,
      id,
      examUpdateBody({ [field]: value }),
    );
    assert.equal(response.status, 422, field);
    const body = (await response.json()) as { code: string; fields: string[] };
    assert.equal(body.code, 'VALIDATION_FAILED', field);
    assert.ok(body.fields.includes(field), field);
  }
  assert.equal(Object.keys(extras).length, 5);
  assert.deepEqual(await examSnapshot(t.prisma, id), beforeEdit);
});

test('H17-C25 - contraindicação fora do questionário do exame gravado responde 422 e não altera', async () => {
  const { clinic, id } = await freshExam({
    tussCode: THYROID(),
    contraindications: [],
  });
  const beforeEdit = await examSnapshot(t.prisma, id);
  const response = await put(
    clinic.cookie,
    id,
    examUpdateBody({ contraindications: ['pregnancy'] }),
  );
  assert.equal(response.status, 422);
  const body = (await response.json()) as { code: string; fields: string[] };
  assert.equal(body.code, 'CONTRAINDICATION_NOT_IN_QUESTIONNAIRE');
  assert.deepEqual(body.fields, ['contraindications.0']);
  assert.deepEqual(await examSnapshot(t.prisma, id), beforeEdit);
});

test('H17-C26 - degraus inválidos na edição respondem 422 e mantêm os degraus gravados', async () => {
  const { clinic, id } = await freshExam();
  const beforeEdit = await examSnapshot(t.prisma, id);
  assert.equal(beforeEdit.priceSteps.length, 3);
  const step = (leadMinutes: number, discountPercent = 10) => ({
    leadMinutes,
    discountPercent,
  });
  const cases = [
    [],
    [1, 2, 3, 4, 5, 6].map((n) => step(n * 60)),
    [step(2880, 10), step(2880, 20)],
    [step(2880, 101)],
  ];
  for (const priceSteps of cases) {
    const response = await put(
      clinic.cookie,
      id,
      examUpdateBody({ priceSteps }),
    );
    assert.equal(response.status, 422, JSON.stringify(priceSteps));
    assert.equal(
      ((await response.json()) as { code: string }).code,
      'VALIDATION_FAILED',
    );
  }
  assert.equal(cases.length, 4);
  assert.deepEqual(await examSnapshot(t.prisma, id), beforeEdit);
});

test('H17-C27 - editar exame de outra clínica responde 404 NOT_FOUND e não altera o exame dela', async () => {
  const idB = await createExam(b);
  const beforeEdit = await examSnapshot(t.prisma, idB);
  const response = await put(
    a.cookie,
    idB,
    examUpdateBody({ fullPriceCents: 99000 }),
  );
  assert.equal(response.status, 404);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), NOT_FOUND);
  assert.ok(!text.includes(idB));
  assert.deepEqual(await examSnapshot(t.prisma, idB), beforeEdit);
});

test('H17-C28 - id inexistente ou que não é uuid responde 404 com o mesmo corpo', async () => {
  const ids = [randomUUID(), 'abc'];
  for (const id of ids) {
    const response = await put(a.cookie, id, examUpdateBody());
    assert.equal(response.status, 404, id);
    assert.deepEqual(await response.json(), NOT_FOUND, id);
  }
  assert.equal(ids.length, 2);
});

test('H17-C29 - edições simultâneas terminam com os degraus de um só corpo', async () => {
  const { clinic, id } = await freshExam();
  const first = [
    { leadMinutes: 2880, discountPercent: 15 },
    { leadMinutes: 360, discountPercent: 35 },
  ];
  const second = [{ leadMinutes: 1440, discountPercent: 25 }];
  for (let round = 0; round < 10; round += 1) {
    const responses = await Promise.all([
      put(clinic.cookie, id, examUpdateBody({ priceSteps: first })),
      put(clinic.cookie, id, examUpdateBody({ priceSteps: second })),
    ]);
    assert.deepEqual(
      responses.map((r) => r.status),
      [200, 200],
      `rodada ${round}`,
    );
    const { priceSteps } = await examSnapshot(t.prisma, id);
    const json = JSON.stringify(priceSteps);
    assert.ok(
      json === JSON.stringify(first) || json === JSON.stringify(second),
      `rodada ${round}: ${json}`,
    );
  }
});

test('H17-C30 - degrau abaixo do piso na edição é gravado como enviado', async () => {
  const { clinic, id } = await freshExam();
  const response = await put(
    clinic.cookie,
    id,
    examUpdateBody({
      fullPriceCents: 72000,
      floorPriceCents: 50000,
      priceSteps: [{ leadMinutes: 360, discountPercent: 40 }],
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await examSnapshot(t.prisma, id)).priceSteps, [
    { leadMinutes: 360, discountPercent: 40 },
  ]);
});

test('H52-C2 - questionário desconhecido responde 422 e preserva o exame', async () => {
  const { clinic, id } = await freshExam();
  await t.prisma.exam.update({
    where: { id },
    data: { questionnaireKey: 'legacy-unknown-questionnaire' },
  });
  const beforeEdit = await examSnapshot(t.prisma, id);
  const response = await put(
    clinic.cookie,
    id,
    examUpdateBody({ fullPriceCents: 80000 }),
  );
  assert.equal(response.status, 422);
  assert.equal(
    ((await response.json()) as { code: string }).code,
    'EXAM_QUESTIONNAIRE_UNAVAILABLE',
  );
  assert.deepEqual(await examSnapshot(t.prisma, id), beforeEdit);
});
