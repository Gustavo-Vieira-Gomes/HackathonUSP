import assert from 'node:assert/strict';
import test from 'node:test';
import { patientSignUpInputSchema } from './patients';

const valid = {
  name: 'Maria Souza',
  email: 'maria@exemplo.com',
  phone: '(11) 98765-4321',
  password: 'senha-segura',
};

function invalidFields(input: Record<string, unknown>): string[] {
  const result = patientSignUpInputSchema.safeParse({ ...valid, ...input });
  if (result.success) return [];
  return [
    ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
  ];
}

test('C41 schema de cadastro aceita e recusa os exemplos do plano', () => {
  const parsed = patientSignUpInputSchema.parse({
    ...valid,
    email: ' Maria@Exemplo.com ',
  });
  assert.equal(parsed.email, 'maria@exemplo.com');
  assert.equal(parsed.phone, '+5511987654321');
  assert.equal(
    patientSignUpInputSchema.parse({ ...valid, phone: '1133334444' }).phone,
    '+551133334444',
  );

  assert.deepEqual(invalidFields({ password: 'a'.repeat(7) }), ['password']);
  assert.deepEqual(invalidFields({ password: 'a'.repeat(8) }), []);
  assert.deepEqual(invalidFields({ password: 'a'.repeat(128) }), []);
  assert.deepEqual(invalidFields({ password: 'a'.repeat(129) }), ['password']);
  assert.deepEqual(invalidFields({ name: '   ' }), ['name']);
  assert.deepEqual(invalidFields({ name: 'M' }), ['name']);
  assert.deepEqual(invalidFields({ email: 'maria.exemplo.com' }), ['email']);
  assert.deepEqual(invalidFields({ phone: '119876543' }), ['phone']);
  assert.deepEqual(invalidFields({ phone: '(011) 3333-4444' }), ['phone']);
  assert.deepEqual(invalidFields({ phone: '(00) 00000-0000' }), ['phone']);
  assert.deepEqual(invalidFields({ phone: 'tel 11 abc 98765-4321' }), [
    'phone',
  ]);
  assert.deepEqual(invalidFields({ name: '', email: 'maria.exemplo.com' }), [
    'name',
    'email',
  ]);
});
