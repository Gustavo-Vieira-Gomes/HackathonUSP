import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  allowedExams,
  examCatalogSchema,
  examListSchema,
  examSchema,
} from '@hackathon/contracts';
import {
  deleteExamsOf,
  examBody,
  examUpdateBody,
  MRI,
  THYROID,
  tussOf,
} from '../../testing/exam-fixtures';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';
import { currentPriceCents } from '../vacancies/price-engine';
import { examQuestionnairesSeed } from './exam-questionnaires.seed';
import { ExamsService } from './exams.service';

type Account = Awaited<ReturnType<typeof signUpWithCookie>>;

let t: TestApp;
const clinicIds: (string | undefined)[] = [];

before(async () => {
  t = await startTestApp();
});

after(async () => {
  await deleteExamsOf(t.prisma, clinicIds);
  await t.close();
});

async function newClinic(): Promise<Account & { clinicId: string }> {
  const account = await signUpWithCookie(t, 'clinica');
  assert.ok(account.clinicId);
  clinicIds.push(account.clinicId);
  return account as Account & { clinicId: string };
}

const post = (cookie: string, body: unknown) =>
  jsonRequest(t, 'POST', '/api/clinic/exams', body, { cookie });

const examCount = (clinicId: string, tussCode?: string) =>
  t.prisma.exam.count({
    where: { clinicId, ...(tussCode ? { tussCode } : {}) },
  });

async function fieldsOf(response: Response): Promise<string[]> {
  const body = (await response.json()) as { code?: string; fields?: string[] };
  assert.equal(body.code, 'VALIDATION_FAILED');
  return body.fields ?? [];
}

test('H17-C1 - cadastro válido da RM responde 201 e grava o exame com questionário e três degraus', async () => {
  const clinic = await newClinic();
  const response = await post(clinic.cookie, examBody());
  assert.equal(response.status, 201);
  const body = examSchema.parse(await response.json());
  const entry = allowedExams.find((e) => e.tussCode === MRI());
  assert.equal(body.name, entry?.name);
  const stored = await t.prisma.exam.findUniqueOrThrow({
    where: { id: body.id },
    include: { priceSteps: { orderBy: { leadMinutes: 'desc' } } },
  });
  assert.equal(stored.clinicId, clinic.clinicId);
  assert.equal(stored.questionnaireKey, 'mri-without-contrast');
  assert.equal(stored.questionnaireVersion, 1);
  assert.deepEqual(
    stored.priceSteps.map((s) => [s.leadMinutes, s.discountPercent]),
    [
      [2880, 10],
      [1440, 20],
      [360, 30],
    ],
  );
  assert.equal(await examCount(clinic.clinicId), 1);
});

test('H17-C2 - piso acima do preço cheio responde 422 FLOOR_ABOVE_FULL_PRICE e piso igual é aceito', async () => {
  const clinic = await newClinic();
  const above = await post(
    clinic.cookie,
    examBody({ fullPriceCents: 72000, floorPriceCents: 80000 }),
  );
  assert.equal(above.status, 422);
  assert.deepEqual(await above.json(), {
    code: 'FLOOR_ABOVE_FULL_PRICE',
    message: 'piso deve ser menor ou igual ao preço cheio',
    fields: ['floorPriceCents'],
  });
  assert.equal(await examCount(clinic.clinicId), 0);
  const equal = await post(
    clinic.cookie,
    examBody({ fullPriceCents: 72000, floorPriceCents: 72000 }),
  );
  assert.equal(equal.status, 201);
});

test('H17-C3 - TUSS fora da lista responde 422 EXAM_NOT_ALLOWED com a lista aceita', async () => {
  const clinic = await newClinic();
  const codes = [
    '99999999',
    // Radiografia de tórax, 1 incidência - https://tuss.clinica.work/metodos-diagnosticos-por-imagem/
    '40805018',
    // Angiotomografia arterial ou venosa (TC com contraste) - https://tuss.clinica.work/tomografia-computadorizada/
    '41001168',
  ];
  const expected = allowedExams.map(({ tussCode, name }) => ({
    tussCode,
    name,
  }));
  for (const tussCode of codes) {
    assert.ok(!allowedExams.some((e) => e.tussCode === tussCode), tussCode);
    const response = await post(clinic.cookie, examBody({ tussCode }));
    assert.equal(response.status, 422, tussCode);
    const body = (await response.json()) as {
      code: string;
      message: string;
      fields: string[];
      allowedExams: unknown;
    };
    assert.equal(body.code, 'EXAM_NOT_ALLOWED');
    assert.deepEqual(body.fields, ['tussCode']);
    assert.deepEqual(body.allowedExams, expected);
    for (const { name } of allowedExams) {
      assert.ok(body.message.includes(name), `${tussCode}: sem ${name}`);
    }
  }
  assert.equal(await examCount(clinic.clinicId), 0);
});

test('H17-C4 - tolerância zero responde 422 VALIDATION_FAILED com o campo', async () => {
  const clinic = await newClinic();
  const response = await post(clinic.cookie, examBody({ toleranceMinutes: 0 }));
  assert.equal(response.status, 422);
  assert.ok((await fieldsOf(response)).includes('toleranceMinutes'));
  assert.equal(await examCount(clinic.clinicId), 0);
});

test('H17-C5 - campo fora do contrato responde 422 com o campo e não grava', async () => {
  const clinic = await newClinic();
  const extras: Record<string, unknown> = {
    clinicId: clinic.clinicId,
    name: 'Outro nome',
    questionnaireKey: 'us-thyroid',
    questionnaireVersion: 2,
  };
  for (const [field, value] of Object.entries(extras)) {
    const response = await post(clinic.cookie, examBody({ [field]: value }));
    assert.equal(response.status, 422, field);
    assert.ok((await fieldsOf(response)).includes(field), field);
  }
  assert.equal(Object.keys(extras).length, 4);
  assert.equal(await examCount(clinic.clinicId), 0);
});

test('H17-C6 - contraindicação fora do questionário do exame responde 422 com o índice', async () => {
  const clinic = await newClinic();
  const cases: [Record<string, unknown>, string][] = [
    [
      { tussCode: THYROID(), contraindications: ['pregnancy'] },
      'contraindications.0',
    ],
    [
      {
        contraindications: ['pacemaker-or-defibrillator', 'fluid-restriction'],
      },
      'contraindications.1',
    ],
  ];
  for (const [patch, field] of cases) {
    const response = await post(clinic.cookie, examBody(patch));
    assert.equal(response.status, 422, field);
    const body = (await response.json()) as { code: string; fields: string[] };
    assert.equal(body.code, 'CONTRAINDICATION_NOT_IN_QUESTIONNAIRE');
    assert.deepEqual(body.fields, [field]);
  }
  const repeated = await post(
    clinic.cookie,
    examBody({ contraindications: ['claustrophobia', 'claustrophobia'] }),
  );
  assert.equal(repeated.status, 422);
  await fieldsOf(repeated);
  assert.equal(await examCount(clinic.clinicId), 0);
});

test('H17-C7 - degrau com antecedência repetida responde 422 com o caminho do degrau', async () => {
  const clinic = await newClinic();
  const response = await post(
    clinic.cookie,
    examBody({
      priceSteps: [
        { leadMinutes: 2880, discountPercent: 10 },
        { leadMinutes: 2880, discountPercent: 20 },
      ],
    }),
  );
  assert.equal(response.status, 422);
  assert.ok((await fieldsOf(response)).includes('priceSteps.1.leadMinutes'));
  assert.equal(await examCount(clinic.clinicId), 0);
});

test('H17-C8 - degrau abaixo do piso é gravado e o motor limita o preço ao piso', async () => {
  const clinic = await newClinic();
  const response = await post(
    clinic.cookie,
    examBody({
      fullPriceCents: 72000,
      floorPriceCents: 50000,
      priceSteps: [
        { leadMinutes: 2880, discountPercent: 10 },
        { leadMinutes: 360, discountPercent: 40 },
      ],
    }),
  );
  assert.equal(response.status, 201);
  const { id } = examSchema.parse(await response.json());
  const steps = await t.prisma.priceStep.findMany({
    where: { examId: id },
    select: { leadMinutes: true, discountPercent: true },
  });
  assert.ok(
    steps.some((s) => s.leadMinutes === 360 && s.discountPercent === 40),
  );
  assert.equal(
    currentPriceCents({
      fullPriceCents: 72000,
      floorPriceCents: 50000,
      steps,
      minutesUntilStart: 300,
    }),
    50000,
  );
});

test('H17-C9 - TUSS repetido responde 422 TUSS_ALREADY_REGISTERED, também em requisições simultâneas', async () => {
  const clinic = await newClinic();
  assert.equal((await post(clinic.cookie, examBody())).status, 201);
  const again = await post(clinic.cookie, examBody());
  assert.equal(again.status, 422);
  assert.deepEqual(await again.json(), {
    code: 'TUSS_ALREADY_REGISTERED',
    message: 'Este exame já está cadastrado na clínica.',
    fields: ['tussCode'],
  });

  // Dez rodadas, cada uma com clínica nova: uma rodada só deixa as duas
  // requisições chegarem em série e não exerce a corrida (verificação, M10).
  for (let round = 0; round < 10; round += 1) {
    const racing = await newClinic();
    const bodies = [
      examBody({ priceSteps: [{ leadMinutes: 2880, discountPercent: 10 }] }),
      examBody({ priceSteps: [{ leadMinutes: 1440, discountPercent: 25 }] }),
    ];
    const responses = await Promise.all(
      bodies.map((b) => post(racing.cookie, b)),
    );
    assert.deepEqual(
      responses.map((r) => r.status).sort(),
      [201, 422],
      `rodada ${round}`,
    );
    const loser = responses.find((r) => r.status === 422)!;
    assert.equal(
      ((await loser.json()) as { code: string }).code,
      'TUSS_ALREADY_REGISTERED',
      `rodada ${round}`,
    );
    assert.equal(await examCount(racing.clinicId, MRI()), 1, `rodada ${round}`);
    const exam = await t.prisma.exam.findFirstOrThrow({
      where: { clinicId: racing.clinicId },
      include: { priceSteps: true },
    });
    const steps = JSON.stringify(
      exam.priceSteps.map((s) => [s.leadMinutes, s.discountPercent]),
    );
    assert.ok(
      steps === '[[2880,10]]' || steps === '[[1440,25]]',
      `rodada ${round}: ${steps}`,
    );
  }
});

test('H17-C10 - outra clínica cadastra o mesmo TUSS', async () => {
  const a = await newClinic();
  const b = await newClinic();
  assert.equal((await post(a.cookie, examBody())).status, 201);
  assert.equal((await post(b.cookie, examBody())).status, 201);
  assert.equal(await examCount(a.clinicId, MRI()), 1);
  assert.equal(await examCount(b.clinicId, MRI()), 1);
});

test('H17-C11 - preço fracionado responde 422 VALIDATION_FAILED com o campo', async () => {
  const clinic = await newClinic();
  const response = await post(
    clinic.cookie,
    examBody({ fullPriceCents: 720.5 }),
  );
  assert.equal(response.status, 422);
  assert.ok((await fieldsOf(response)).includes('fullPriceCents'));
  assert.equal(await examCount(clinic.clinicId), 0);
});

test('H17-C12 - toda chave de allowedExams tem questionário no catálogo com preparo que cabe no corpo', () => {
  for (const exam of allowedExams) {
    const questionnaire = examQuestionnairesSeed.find(
      (q) => q.key === exam.questionnaireKey,
    );
    assert.ok(questionnaire, exam.questionnaireKey);
    const { condition, hoursBefore } = questionnaire.preparation;
    assert.ok(condition.length >= 1 && condition.length <= 500, exam.tussCode);
    assert.ok(
      Number.isInteger(hoursBefore) && hoursBefore <= 72,
      exam.tussCode,
    );
  }
});

test('H17-C13 - a aplicação resolve o ExamsService', () => {
  assert.ok(t.app.get(ExamsService) instanceof ExamsService);
});

test('H17-C14 - a lista traz só os exames da clínica da sessão, por nome e degraus decrescentes', async () => {
  const a = await newClinic();
  const b = await newClinic();
  assert.equal(
    (
      await post(
        a.cookie,
        examBody({
          tussCode: THYROID(),
          contraindications: [],
          priceSteps: [
            { leadMinutes: 360, discountPercent: 30 },
            { leadMinutes: 2880, discountPercent: 10 },
          ],
        }),
      )
    ).status,
    201,
  );
  assert.equal((await post(a.cookie, examBody())).status, 201);
  const fromB = await post(b.cookie, examBody());
  const idB = examSchema.parse(await fromB.json()).id;

  const response = await jsonRequest(
    t,
    'GET',
    `/api/clinic/exams?clinicId=${b.clinicId}`,
    undefined,
    { cookie: a.cookie },
  );
  assert.equal(response.status, 200);
  const { exams } = examListSchema.parse(await response.json());
  assert.equal(exams.length, 2);
  assert.ok(!exams.some((e) => e.id === idB));
  const names = exams.map((e) => e.name);
  assert.deepEqual(
    names,
    [...names].sort((x, y) => x.localeCompare(y)),
  );
  for (const exam of exams) {
    const leads = exam.priceSteps.map((s) => s.leadMinutes);
    assert.deepEqual(
      leads,
      [...leads].sort((x, y) => y - x),
    );
  }
  const stored = await t.prisma.exam.findMany({
    where: { clinicId: a.clinicId },
    select: { id: true },
  });
  assert.deepEqual(
    exams.map((e) => e.id).sort(),
    stored.map((e) => e.id).sort(),
  );
});

test('H17-C15 - clínica sem exame recebe lista vazia', async () => {
  const clinic = await newClinic();
  const response = await jsonRequest(t, 'GET', '/api/clinic/exams', undefined, {
    cookie: clinic.cookie,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { exams: [] });
});

test('H17-C16 - o catálogo traz um item por exame permitido com preparo e contraindicações do questionário', async () => {
  const clinic = await newClinic();
  const response = await jsonRequest(
    t,
    'GET',
    '/api/clinic/exam-catalog',
    undefined,
    { cookie: clinic.cookie },
  );
  assert.equal(response.status, 200);
  const { items } = examCatalogSchema.parse(await response.json());
  assert.equal(items.length, allowedExams.length);
  items.forEach((item, index) => {
    const entry = allowedExams[index]!;
    assert.equal(item.tussCode, entry.tussCode);
    assert.equal(item.name, entry.name);
    assert.equal(item.questionnaireKey, entry.questionnaireKey);
    const questionnaire = examQuestionnairesSeed.find(
      (q) => q.key === entry.questionnaireKey,
    )!;
    assert.deepEqual(item.preparation, {
      condition: questionnaire.preparation.condition,
      hoursBefore: questionnaire.preparation.hoursBefore,
    });
    assert.deepEqual(
      item.contraindicationOptions,
      questionnaire.contraindications.map(({ id, question }) => ({
        id,
        question,
      })),
    );
  });
  const thyroid = items.find((i) => i.tussCode === tussOf('us-thyroid'));
  assert.deepEqual(thyroid?.contraindicationOptions, []);
});

test('H17-C17 - sem sessão as 6 rotas respondem 401 e com paciente respondem 403', async () => {
  const clinic = await newClinic();
  const created = await post(clinic.cookie, examBody());
  const examId = examSchema.parse(await created.json()).id;
  const before = await t.prisma.clinic.findUniqueOrThrow({
    where: { id: clinic.clinicId },
  });
  const patient = await signUpWithCookie(t, 'paciente');
  const routes: [string, string, unknown][] = [
    [
      'POST',
      '/api/clinic/exams',
      examBody({ tussCode: THYROID(), contraindications: [] }),
    ],
    [
      'PUT',
      `/api/clinic/exams/${examId}`,
      examUpdateBody({ fullPriceCents: 90000 }),
    ],
    ['GET', '/api/clinic/exams', undefined],
    ['GET', '/api/clinic/exam-catalog', undefined],
    ['GET', '/api/clinic/settings', undefined],
    [
      'PATCH',
      '/api/clinic/settings',
      { depositPercent: 30, dailyDiscountCap: 1 },
    ],
  ];
  for (const [method, path, body] of routes) {
    const anonymous = await jsonRequest(t, method, path, body);
    assert.equal(anonymous.status, 401, `${method} ${path}`);
    const asPatient = await jsonRequest(t, method, path, body, {
      cookie: patient.cookie,
    });
    assert.equal(asPatient.status, 403, `${method} ${path}`);
  }
  assert.equal(routes.length, 6);
  assert.equal(await examCount(clinic.clinicId), 1);
  const stored = await t.prisma.exam.findUniqueOrThrow({
    where: { id: examId },
  });
  assert.equal(stored.fullPriceCents, 72000);
  const afterRow = await t.prisma.clinic.findUniqueOrThrow({
    where: { id: clinic.clinicId },
  });
  assert.deepEqual(afterRow, before);
});
