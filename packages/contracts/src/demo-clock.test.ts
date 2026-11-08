import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoClockAdvanceBodySchema } from './demo-clock';

test('advanceMinutes aceita inteiro positivo até 30 dias', () => {
  assert.equal(
    demoClockAdvanceBodySchema.safeParse({ advanceMinutes: 1500 }).success,
    true,
  );
  assert.equal(
    demoClockAdvanceBodySchema.safeParse({ advanceMinutes: 30 * 24 * 60 })
      .success,
    true,
  );
});

test('advanceMinutes recusa zero, negativo, fração, acima de 30 dias e campo extra', () => {
  for (const body of [
    { advanceMinutes: 0 },
    { advanceMinutes: -60 },
    { advanceMinutes: 1.5 },
    { advanceMinutes: 30 * 24 * 60 + 1 },
    { advanceMinutes: 60, offsetMinutes: 0 },
    {},
  ]) {
    assert.equal(
      demoClockAdvanceBodySchema.safeParse(body).success,
      false,
      JSON.stringify(body),
    );
  }
});
