import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePhoneInput } from './phone-input';

test('telefone brasileiro formatado e internacional preservam os dígitos e +', () => {
  assert.equal(normalizePhoneInput('(11) 99999-9999'), '11999999999');
  assert.equal(normalizePhoneInput('+55 (11) 99999-9999'), '+5511999999999');
  assert.equal(normalizePhoneInput('11999999999'), '11999999999');
});

test('não transforma letras ou + interno em um telefone válido', () => {
  assert.equal(normalizePhoneInput('abc 11999999999'), 'abc11999999999');
  assert.equal(normalizePhoneInput('11+999999999'), '11+999999999');
});
