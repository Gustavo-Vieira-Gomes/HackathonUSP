import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vacancyFormBody, vacancyErrorMessage } from './vacancy-form';

test('H20 formulário interpreta os horários como São Paulo, independente do fuso do navegador', () => {
  assert.deepEqual(
    vacancyFormBody('exam', '2026-11-12T21:00', '2026-11-12T21:30'),
    {
      examId: 'exam',
      startsAt: '2026-11-13T00:00:00.000Z',
      endsAt: '2026-11-13T00:30:00.000Z',
      reason: 'vazio',
    },
  );
});

test('H20 mostra recusa de preparo/teto e esconde mensagens de falha inesperada', () => {
  assert.equal(
    vacancyErrorMessage(422, { message: 'antecedência menor que o preparo' }),
    'antecedência menor que o preparo',
  );
  assert.equal(
    vacancyErrorMessage(422, { message: 'Teto diário: 5' }),
    'Teto diário: 5',
  );
  assert.equal(
    vacancyErrorMessage(500, { message: 'stack interna' }),
    'Não foi possível concluir agora. Tente novamente.',
  );
});
