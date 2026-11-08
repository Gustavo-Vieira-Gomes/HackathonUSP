import assert from 'node:assert/strict';
import test from 'node:test';
import {
  examQuestionnaireKeySchema,
  examQuestionnaireSchema,
} from '@hackathon/contracts';
import { examQuestionnairesSeed } from './modules/exams/exam-questionnaires.seed';

test('catálogo cobre todos os modelos declarados sem duplicação e sem falsa aprovação médica', () => {
  assert.deepEqual(
    examQuestionnairesSeed.map(({ key }) => key).sort(),
    [...examQuestionnaireKeySchema.options].sort(),
  );
  for (const questionnaire of examQuestionnairesSeed) {
    assert.equal(questionnaire.clinicalReview.status, 'pending');
  }
});

test('horas inválidas e perguntas duplicadas são recusadas antes de consumir o seed', () => {
  const questionnaire = examQuestionnairesSeed.find(
    ({ key }) => key === 'mri-without-contrast',
  );
  assert.ok(questionnaire);
  for (const hoursBefore of [-1, Infinity, NaN, 73]) {
    assert.equal(
      examQuestionnaireSchema.safeParse({
        ...questionnaire,
        preparation: { ...questionnaire.preparation, hoursBefore },
      }).success,
      false,
    );
  }
  assert.equal(
    examQuestionnaireSchema.safeParse({
      ...questionnaire,
      contraindications: [
        ...questionnaire.contraindications,
        ...questionnaire.contraindications,
      ],
    }).success,
    false,
  );
});

test('preparos com antecedência e casos de encaminhamento da demo estão representados', () => {
  const abdomen = examQuestionnairesSeed.find(
    ({ key }) => key === 'us-abdomen',
  );
  const pelvis = examQuestionnairesSeed.find(
    ({ key }) => key === 'us-pelvis-transabdominal',
  );
  const mri = examQuestionnairesSeed.find(
    ({ key }) => key === 'mri-without-contrast',
  );
  const ct = examQuestionnairesSeed.find(
    ({ key }) => key === 'ct-without-contrast',
  );
  assert.equal(abdomen?.preparation.hoursBefore, 8);
  assert.equal(pelvis?.preparation.hoursBefore, 1);
  assert.ok(
    mri?.contraindications.some(
      ({ id }) => id === 'pacemaker-or-defibrillator',
    ),
  );
  assert.ok(mri?.contraindications.some(({ id }) => id === 'metal-fragment'));
  assert.ok(mri?.contraindications.some(({ id }) => id === 'claustrophobia'));
  assert.ok(ct?.contraindications.some(({ id }) => id === 'pregnancy'));
});
