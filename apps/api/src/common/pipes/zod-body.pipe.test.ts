import assert from 'node:assert/strict';
import test from 'node:test';
import { UnprocessableEntityException } from '@nestjs/common';
import { z } from 'zod';
import { ZodBodyPipe } from './zod-body.pipe';

const schema = z.strictObject({
  code: z
    .string()
    .min(3)
    .refine((value) => value.startsWith('A')),
});
const pipe = new ZodBodyPipe(schema);

function fieldsOf(value: unknown): string[] {
  try {
    pipe.transform(value);
  } catch (error) {
    assert.ok(error instanceof UnprocessableEntityException);
    assert.equal(error.getStatus(), 422);
    const body = error.getResponse() as {
      code: string;
      message: string;
      fields: string[];
    };
    assert.equal(body.code, 'VALIDATION_FAILED');
    assert.equal(body.message, 'Campos inválidos ou ausentes.');
    return body.fields;
  }
  assert.fail('o pipe deveria lançar 422');
}

test('H16-C6 - corpo não objeto vira fields [body], caminho repetido sai uma vez e valor válido passa', () => {
  const notObjects: unknown[] = [undefined, null, 'texto', []];
  for (const value of notObjects) {
    assert.deepEqual(fieldsOf(value), ['body'], JSON.stringify(value));
  }
  assert.equal(notObjects.length, 4);

  // 'x' falha no min(3) e no refine: duas issues no mesmo caminho.
  assert.deepEqual(fieldsOf({ code: 'x' }), ['code']);

  assert.deepEqual(pipe.transform({ code: 'Abc' }), { code: 'Abc' });
});
