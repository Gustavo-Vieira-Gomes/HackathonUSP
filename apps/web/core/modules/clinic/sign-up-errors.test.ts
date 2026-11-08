import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signUpErrorView } from './sign-up-errors';

const submitted = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinute: 480,
  endMinute: 1080,
}));

test('H16-C28 - 422 vira mensagem por campo e 503/502/504/429 viram aviso de indisponibilidade', () => {
  const fields = signUpErrorView(
    422,
    {
      code: 'VALIDATION_FAILED',
      fields: ['cnes', 'openingHours.3.startMinute'],
    },
    submitted,
  );
  assert.ok(fields.fieldErrors.cnes, 'sem mensagem no CNES');
  assert.ok(fields.fieldErrors['open-3'], 'sem mensagem na abertura de quarta');
  assert.equal(fields.firstField, 'cnes');
  assert.equal(fields.general, undefined);

  const address = signUpErrorView(
    422,
    { code: 'ADDRESS_NOT_FOUND', fields: ['address'] },
    submitted,
  );
  assert.ok(address.fieldErrors.address);
  assert.equal(address.firstField, 'address');

  const statuses = [503, 502, 504, 429];
  for (const status of statuses) {
    const view = signUpErrorView(
      status,
      { code: 'GEOCODING_UNAVAILABLE' },
      submitted,
    );
    assert.match(view.general ?? '', /Tente de novo em instantes/, `${status}`);
    assert.deepEqual(view.fieldErrors, {}, `${status}`);
  }
  assert.equal(statuses.length, 4);
});
