import assert from 'node:assert/strict';
import { test } from 'node:test';
import { patientAuthError } from './auth-errors';

test('consentimento recusado é explicado sem exibir resposta arbitrária', () => {
  assert.match(
    patientAuthError(422, {
      code: 'CONSENT_REQUIRED',
      fields: ['healthDataConsent'],
    }),
    /Consentimento obrigatório/,
  );
  assert.match(
    patientAuthError(503, { message: 'database secret' }),
    /Tente novamente/,
  );
  assert.doesNotMatch(
    patientAuthError(503, { message: 'database secret' }),
    /secret/,
  );
});

test('login inválido, duplicidade e limite têm mensagens úteis', () => {
  assert.match(patientAuthError(401, {}), /e-mail e senha/);
  assert.match(
    patientAuthError(422, { code: 'USER_ALREADY_EXISTS' }),
    /Já existe/,
  );
  assert.match(patientAuthError(429, {}), /Muitas tentativas/);
});
