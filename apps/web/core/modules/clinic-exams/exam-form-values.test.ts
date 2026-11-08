import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Exam,
  type ExamCatalogItem,
  examCreateBodySchema,
  examUpdateBodySchema,
} from '@hackathon/contracts';
import {
  applyCatalogItem,
  centsToReais,
  examToFormValues,
  hoursToMinutes,
  initialExamForm,
  minutesToHours,
  reaisToCents,
  toExamBody,
} from './exam-form-values';

const mriItem: ExamCatalogItem = {
  tussCode: '41101316',
  name: 'Ressonância magnética articular sem contraste',
  questionnaireKey: 'mri-without-contrast',
  preparation: { condition: 'Retirar objetos metálicos.', hoursBefore: 0 },
  contraindicationOptions: [
    { id: 'pacemaker-or-defibrillator', question: 'Marca-passo?' },
    { id: 'implant-or-device', question: 'Implante?' },
    { id: 'metal-fragment', question: 'Fragmento metálico?' },
    { id: 'claustrophobia', question: 'Claustrofobia?' },
    { id: 'pregnancy', question: 'Gestação?' },
  ],
};

const thyroidItem: ExamCatalogItem = {
  tussCode: '40901203',
  name: 'Ultrassonografia de tireoide',
  questionnaireKey: 'us-thyroid',
  preparation: { condition: 'Sem preparo.', hoursBefore: 0 },
  contraindicationOptions: [],
};

test('H17-C31 - converte reais em centavos e horas em minutos, e recusa texto inválido', () => {
  const cases: [string, number | null][] = [
    ['720,00', 72000],
    ['720', 72000],
    ['1.234,56', 123456],
    ['720,5', 72050],
    ['', null],
    ['abc', null],
    ['-1', null],
  ];
  for (const [text, cents] of cases) {
    assert.equal(reaisToCents(text), cents, text);
  }
  assert.equal(centsToReais(72000), '720,00');
  assert.equal(hoursToMinutes(48), 2880);
  assert.equal(hoursToMinutes(6), 360);
  assert.equal(minutesToHours(1440), 24);
  assert.equal(cases.length + 4, 11);
});

test('H17-C32 - monta o corpo de cadastro e de edição em centavos e minutos e volta o exame para reais e horas', () => {
  const values = {
    ...applyCatalogItem(initialExamForm(), mriItem),
    fullPrice: '720,00',
    floorPrice: '500,00',
    minLeadHours: '6',
    contraindications: ['pacemaker-or-defibrillator'],
  };
  const create = toExamBody(values, 'create');
  assert.equal(create.fullPriceCents, 72000);
  assert.equal(create.floorPriceCents, 50000);
  assert.deepEqual(create.priceSteps, [
    { leadMinutes: 2880, discountPercent: 10 },
    { leadMinutes: 1440, discountPercent: 20 },
    { leadMinutes: 360, discountPercent: 30 },
  ]);
  const parsedCreate = examCreateBodySchema.safeParse(create);
  assert.equal(parsedCreate.success, true, parsedCreate.error?.message);

  const update = toExamBody(values, 'update');
  assert.ok(!('tussCode' in update));
  const withoutTuss = { ...create };
  delete withoutTuss.tussCode;
  assert.deepEqual(update, withoutTuss);
  const parsedUpdate = examUpdateBodySchema.safeParse(update);
  assert.equal(parsedUpdate.success, true, parsedUpdate.error?.message);

  const exam: Exam = {
    id: '6f1c6c1e-2f7a-4a4e-9a51-0d0a7c2b1e01',
    tussCode: mriItem.tussCode,
    name: mriItem.name,
    fullPriceCents: 80000,
    floorPriceCents: 55000,
    minLeadMinutes: 360,
    preparationCondition: 'nenhum',
    preparationHours: 0,
    contraindications: ['claustrophobia'],
    toleranceMinutes: 20,
    maxTravelMinutes: 60,
    priceSteps: [{ leadMinutes: 2880, discountPercent: 15 }],
  };
  const form = examToFormValues(exam, mriItem);
  assert.equal(form.fullPrice, '800,00');
  assert.equal(form.floorPrice, '550,00');
  assert.deepEqual(form.priceSteps, [{ hours: '48', discountPercent: '15' }]);
});

test('H17-C33 - o formulário abre com os padrões e a escolha do exame traz preparo e contraindicações', () => {
  const form = initialExamForm();
  assert.equal(form.tussCode, '');
  assert.equal(form.toleranceMinutes, '15');
  assert.equal(form.maxTravelMinutes, '45');
  assert.deepEqual(form.priceSteps, [
    { hours: '48', discountPercent: '10' },
    { hours: '24', discountPercent: '20' },
    { hours: '6', discountPercent: '30' },
  ]);

  const mri = applyCatalogItem(form, mriItem);
  assert.equal(mri.tussCode, mriItem.tussCode);
  assert.equal(mri.preparationCondition, mriItem.preparation.condition);
  assert.equal(mri.preparationHours, '0');
  assert.deepEqual(
    mri.contraindicationOptions,
    mriItem.contraindicationOptions,
  );
  assert.equal(mri.contraindicationOptions.length, 5);
  assert.deepEqual(mri.contraindications, []);

  const thyroid = applyCatalogItem(
    { ...mri, contraindications: ['claustrophobia'] },
    thyroidItem,
  );
  assert.deepEqual(thyroid.contraindicationOptions, []);
  assert.deepEqual(thyroid.contraindications, []);
});
