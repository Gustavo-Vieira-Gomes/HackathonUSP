import assert from 'node:assert/strict';
import test from 'node:test';
import { healthResponseSchema } from './index';

test('rejeita um serviço indisponível declarado como saudável', () => {
  assert.equal(
    healthResponseSchema.safeParse({ status: 'down', service: 'api' }).success,
    false,
  );
});
test('aceita resposta de saúde de ambos os adaptadores', () => {
  for (const service of ['web', 'api']) {
    assert.equal(
      healthResponseSchema.safeParse({ status: 'ok', service }).success,
      true,
    );
  }
});
