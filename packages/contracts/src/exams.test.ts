import assert from 'node:assert/strict';
import test from 'node:test';
import type { z } from 'zod';
import { examQuestionnaireKeySchema } from './exam-questionnaires';
import {
  allowedExams,
  clinicSettingsSchema,
  examCreateBodySchema,
  examFormDefaults,
  examUpdateBodySchema,
} from './exams';

const valid = {
  tussCode: '41101316',
  fullPriceCents: 72000,
  floorPriceCents: 50000,
  minLeadMinutes: 360,
  preparationCondition: 'nenhum',
  preparationHours: 0,
  contraindications: ['pacemaker-or-defibrillator'],
  toleranceMinutes: 15,
  maxTravelMinutes: 45,
  priceSteps: [
    { leadMinutes: 2880, discountPercent: 10 },
    { leadMinutes: 1440, discountPercent: 20 },
    { leadMinutes: 360, discountPercent: 30 },
  ],
};

const { tussCode: _tuss, ...validUpdate } = valid;

function refusedPaths(schema: z.ZodType, body: unknown): string[] {
  const result = schema.safeParse(body);
  assert.equal(
    result.success,
    false,
    `deveria recusar ${JSON.stringify(body)}`,
  );
  return result.error!.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => [...issue.path, key].join('.'))
      : [issue.path.join('.')],
  );
}

function refuses(
  schema: z.ZodType,
  base: Record<string, unknown>,
  cases: [Record<string, unknown>, string][],
) {
  for (const [patch, path] of cases) {
    const paths = refusedPaths(schema, { ...base, ...patch });
    assert.ok(
      paths.includes(path),
      `${JSON.stringify(patch)}: esperava ${path}, veio ${paths.join(',')}`,
    );
  }
}

function accepts(
  schema: z.ZodType,
  base: Record<string, unknown>,
  cases: Record<string, unknown>[],
) {
  for (const patch of cases) {
    const result = schema.safeParse({ ...base, ...patch });
    assert.equal(
      result.success,
      true,
      `${JSON.stringify(patch)}: ${result.error?.message}`,
    );
  }
}

const xyRefusals: [Record<string, unknown>, string][] = [
  [{ toleranceMinutes: 0 }, 'toleranceMinutes'],
  [{ toleranceMinutes: -1 }, 'toleranceMinutes'],
  [{ toleranceMinutes: 1.5 }, 'toleranceMinutes'],
  [{ toleranceMinutes: 121 }, 'toleranceMinutes'],
  [{ maxTravelMinutes: 0 }, 'maxTravelMinutes'],
  [{ maxTravelMinutes: -1 }, 'maxTravelMinutes'],
  [{ maxTravelMinutes: 1.5 }, 'maxTravelMinutes'],
  [{ maxTravelMinutes: 241 }, 'maxTravelMinutes'],
];

const rangeRefusals: [Record<string, unknown>, string][] = [
  [{ fullPriceCents: 0 }, 'fullPriceCents'],
  [{ fullPriceCents: 10_000_001 }, 'fullPriceCents'],
  [{ fullPriceCents: 720.5 }, 'fullPriceCents'],
  [{ floorPriceCents: 0 }, 'floorPriceCents'],
  [{ floorPriceCents: 10_000_001 }, 'floorPriceCents'],
  [{ minLeadMinutes: -1 }, 'minLeadMinutes'],
  [{ minLeadMinutes: 10_081 }, 'minLeadMinutes'],
  [{ minLeadMinutes: 1.5 }, 'minLeadMinutes'],
  [{ preparationHours: -1 }, 'preparationHours'],
  [{ preparationHours: 73 }, 'preparationHours'],
  [{ preparationCondition: '   ' }, 'preparationCondition'],
  [{ preparationCondition: 'a'.repeat(501) }, 'preparationCondition'],
];

const tussRefusals: [Record<string, unknown>, string][] = [
  [{ tussCode: '1234567' }, 'tussCode'],
  [{ tussCode: '1234567a' }, 'tussCode'],
];

test('H17-C4 - recusa X e Y zero, negativos, fracionados e acima do limite e aceita os limites', () => {
  refuses(examCreateBodySchema, valid, xyRefusals);
  accepts(examCreateBodySchema, valid, [
    { toleranceMinutes: 1 },
    { toleranceMinutes: 120 },
    { maxTravelMinutes: 1 },
    { maxTravelMinutes: 240 },
  ]);
  assert.equal(xyRefusals.length, 8);
});

test('H17-C6 - recusa contraindicação repetida e fora do catálogo', () => {
  refuses(examCreateBodySchema, valid, [
    [
      { contraindications: ['claustrophobia', 'claustrophobia'] },
      'contraindications.1',
    ],
    [{ contraindications: ['nao-existe'] }, 'contraindications.0'],
  ]);
});

test('H17-C7 - recusa degraus vazios, demais, repetidos e fora da faixa e aceita os limites', () => {
  const step = (leadMinutes: number, discountPercent = 10) => ({
    leadMinutes,
    discountPercent,
  });
  refuses(examCreateBodySchema, valid, [
    [{ priceSteps: [] }, 'priceSteps'],
    [{ priceSteps: [1, 2, 3, 4, 5, 6].map((n) => step(n * 60)) }, 'priceSteps'],
    [
      { priceSteps: [step(2880, 10), step(2880, 20)] },
      'priceSteps.1.leadMinutes',
    ],
    [{ priceSteps: [step(2880, 0)] }, 'priceSteps.0.discountPercent'],
    [{ priceSteps: [step(2880, 101)] }, 'priceSteps.0.discountPercent'],
    [{ priceSteps: [step(0)] }, 'priceSteps.0.leadMinutes'],
    [{ priceSteps: [step(10_081)] }, 'priceSteps.0.leadMinutes'],
  ]);
  accepts(examCreateBodySchema, valid, [
    { priceSteps: [step(2880)] },
    { priceSteps: [1, 2, 3, 4, 5].map((n) => step(n * 60)) },
    { priceSteps: [step(2880, 1)] },
    { priceSteps: [step(2880, 100)] },
    { priceSteps: [step(1)] },
    { priceSteps: [step(10_080)] },
  ]);
});

test('H17-C11 - recusa preço, piso, antecedência, preparo e TUSS fora das faixas e aceita os limites', () => {
  refuses(examCreateBodySchema, valid, [...rangeRefusals, ...tussRefusals]);
  accepts(examCreateBodySchema, valid, [
    { fullPriceCents: 1, floorPriceCents: 1 },
    { fullPriceCents: 10_000_000 },
    { minLeadMinutes: 0 },
    { minLeadMinutes: 10_080 },
    { preparationHours: 0 },
    { preparationHours: 72 },
    { preparationCondition: 'a'.repeat(500) },
  ]);
  assert.equal(rangeRefusals.length + tussRefusals.length, 14);
});

test('H17-C12 - allowedExams cobre os 9 questionários com 1 ou 2 códigos únicos de 8 dígitos e os padrões batem com a spec', () => {
  const codes = allowedExams.map((exam) => exam.tussCode);
  for (const code of codes) assert.match(code, /^\d{8}$/);
  assert.equal(new Set(codes).size, codes.length);
  const keys = examQuestionnaireKeySchema.options;
  assert.equal(keys.length, 9);
  for (const key of keys) {
    const count = allowedExams.filter((e) => e.questionnaireKey === key).length;
    assert.ok(count >= 1 && count <= 2, `${key}: ${count} entradas`);
  }
  for (const exam of allowedExams) {
    assert.ok(keys.includes(exam.questionnaireKey), exam.tussCode);
    assert.ok(exam.name.trim().length > 0, exam.tussCode);
  }
  assert.deepEqual(examFormDefaults, {
    toleranceMinutes: 15,
    maxTravelMinutes: 45,
    priceSteps: [
      { leadMinutes: 2880, discountPercent: 10 },
      { leadMinutes: 1440, discountPercent: 20 },
      { leadMinutes: 360, discountPercent: 30 },
    ],
    depositPercent: 20,
    dailyDiscountCap: 5,
  });
  accepts(examCreateBodySchema, valid, [
    {
      toleranceMinutes: examFormDefaults.toleranceMinutes,
      maxTravelMinutes: examFormDefaults.maxTravelMinutes,
      priceSteps: examFormDefaults.priceSteps.map((s) => ({ ...s })),
    },
  ]);
  assert.equal(
    clinicSettingsSchema.safeParse({
      depositPercent: examFormDefaults.depositPercent,
      dailyDiscountCap: examFormDefaults.dailyDiscountCap,
    }).success,
    true,
  );
});

test('H17-C20 - recusa sinal e teto fora da faixa e campo extra e aceita os limites', () => {
  const base = { depositPercent: 20, dailyDiscountCap: 5 };
  const cases: [Record<string, unknown>, string][] = [
    [{ depositPercent: 0 }, 'depositPercent'],
    [{ depositPercent: 101 }, 'depositPercent'],
    [{ depositPercent: 20.5 }, 'depositPercent'],
    [{ dailyDiscountCap: -1 }, 'dailyDiscountCap'],
    [{ dailyDiscountCap: 101 }, 'dailyDiscountCap'],
    [{ dailyDiscountCap: 2.5 }, 'dailyDiscountCap'],
    [{ clinicId: 'x' }, 'clinicId'],
  ];
  refuses(clinicSettingsSchema, base, cases);
  accepts(clinicSettingsSchema, base, [
    { depositPercent: 1 },
    { depositPercent: 100 },
    { dailyDiscountCap: 0 },
    { dailyDiscountCap: 100 },
  ]);
  assert.equal(cases.length, 7);
});

test('H17-C23 - a edição recusa as mesmas faixas do cadastro e não aceita tussCode', () => {
  refuses(examUpdateBodySchema, validUpdate, [...xyRefusals, ...rangeRefusals]);
  accepts(examUpdateBodySchema, validUpdate, [{}]);
  assert.ok(
    refusedPaths(examUpdateBodySchema, valid).includes('tussCode'),
    'tussCode no corpo da edição',
  );
});

test('H52-C1 - abdome total não recebe o protocolo de abdome superior', () => {
  assert.ok(!allowedExams.some((exam) => exam.tussCode === '40901122'));
  assert.equal(
    allowedExams.find((exam) => exam.tussCode === '40901130')?.questionnaireKey,
    'us-abdomen',
  );
});
