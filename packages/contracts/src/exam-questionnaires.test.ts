import assert from 'node:assert/strict';
import test from 'node:test';
import { clinicalReviewSchema, examQuestionnaireAnswersSchema } from './index';

const response = {
  questionnaireKey: 'mri-without-contrast',
  questionnaireVersion: 1,
  preparationConfirmed: false,
  answers: [{ questionId: 'pregnancy', answer: 'unknown' }],
};

test('preserva resposta incerta e preparo não cumprido sem coagir para aprovação', () => {
  const parsed = examQuestionnaireAnswersSchema.parse(response);
  assert.equal(parsed.preparationConfirmed, false);
  assert.equal(parsed.answers[0]?.answer, 'unknown');
});

test('rejeita texto livre, IDs desconhecidos, respostas duplicadas e aprovação enviada pelo paciente', () => {
  for (const invalid of [
    { ...response, answers: [{ questionId: 'pregnancy', answer: 'talvez' }] },
    { ...response, answers: [{ questionId: 'other', answer: 'no' }] },
    { ...response, answers: [...response.answers, ...response.answers] },
    { ...response, clinicalReview: { status: 'approved' } },
    { ...response, preparationConfirmed: 'true' },
    { ...response, questionnaireVersion: 0 },
    { ...response, questionnaireKey: 'ct-with-contrast' },
  ]) {
    assert.equal(
      examQuestionnaireAnswersSchema.safeParse(invalid).success,
      false,
    );
  }
});

test('revisão médica aprovada exige identidade, registro, data e evidência', () => {
  assert.equal(
    clinicalReviewSchema.safeParse({ status: 'approved' }).success,
    false,
  );
  assert.equal(
    clinicalReviewSchema.safeParse({ status: 'pending' }).success,
    true,
  );
  assert.equal(
    clinicalReviewSchema.safeParse({
      status: 'approved',
      reviewer: 'Mentor de teste',
      professionalRegistration: 'CRM de teste',
      reviewedAt: '2026-11-08T03:00:00Z',
      evidenceUrl: 'https://example.org/validation',
    }).success,
    true,
  );
});
