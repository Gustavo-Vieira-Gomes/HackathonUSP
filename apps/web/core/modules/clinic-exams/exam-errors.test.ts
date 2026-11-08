import assert from 'node:assert/strict';
import { test } from 'node:test';
import { examFormErrorView } from './exam-errors';

test('H17-C34 - traduz 422, 404 e indisponibilidade da API em mensagens da tela', () => {
  const floor = examFormErrorView(422, {
    code: 'FLOOR_ABOVE_FULL_PRICE',
    message: 'piso deve ser menor ou igual ao preço cheio',
    fields: ['floorPriceCents'],
  });
  assert.deepEqual(floor.fieldErrors, {
    floorPriceCents: 'piso deve ser menor ou igual ao preço cheio',
  });
  assert.equal(floor.firstField, 'floorPriceCents');
  assert.equal(floor.general, undefined);

  const notAllowed = examFormErrorView(422, {
    code: 'EXAM_NOT_ALLOWED',
    message: 'Exame fora do escopo.',
    fields: ['tussCode'],
    allowedExams: [
      { tussCode: '41101316', name: 'RM articular' },
      { tussCode: '40901203', name: 'US de tireoide' },
    ],
  });
  assert.ok(notAllowed.fieldErrors.tussCode);
  assert.deepEqual(notAllowed.allowedExamNames, [
    'RM articular',
    'US de tireoide',
  ]);

  const validation = examFormErrorView(422, {
    code: 'VALIDATION_FAILED',
    message: 'Campos inválidos ou ausentes.',
    fields: ['priceSteps.1.leadMinutes', 'toleranceMinutes'],
  });
  assert.deepEqual(Object.keys(validation.fieldErrors).sort(), [
    'priceSteps.1.leadMinutes',
    'toleranceMinutes',
  ]);
  assert.ok(validation.fieldErrors['priceSteps.1.leadMinutes']);
  assert.ok(validation.fieldErrors.toleranceMinutes);
  assert.equal(validation.firstField, 'priceSteps.1.leadMinutes');

  const repeated = examFormErrorView(422, {
    code: 'TUSS_ALREADY_REGISTERED',
    message: 'Este exame já está cadastrado na clínica.',
    fields: ['tussCode'],
  });
  assert.equal(
    repeated.fieldErrors.tussCode,
    'Este exame já está cadastrado na clínica.',
  );

  const missing = examFormErrorView(404, {
    code: 'NOT_FOUND',
    message: 'Exame não encontrado.',
  });
  assert.ok(missing.general?.includes('Este exame não foi encontrado'));
  assert.equal(missing.reload, true);
  assert.deepEqual(missing.fieldErrors, {});

  for (const status of [500, 502, 504]) {
    const view = examFormErrorView(status, { code: 'API_TIMEOUT' });
    assert.ok(
      view.general?.includes('Tente de novo em instantes'),
      `${status}`,
    );
    assert.deepEqual(view.fieldErrors, {}, `${status}`);
  }
});
