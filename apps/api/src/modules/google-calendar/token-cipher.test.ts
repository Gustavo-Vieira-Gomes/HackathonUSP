import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { decryptToken, encryptToken, TokenCipherError } from './token-cipher';

const key = Buffer.alloc(32, 9);
const clinicA = randomUUID();
const clinicB = randomUUID();
const secret = '1//refresh-token-de-teste-que-nao-pode-aparecer';

function tamper(value: string, index: number): string {
  const parts = value.split('.');
  const bytes = Buffer.from(parts[index] ?? '', 'base64url');
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  parts[index] = bytes.toString('base64url');
  return parts.join('.');
}

test('H18-C35 - AES-256-GCM com AAD da clínica: ida e volta, IV aleatório e 5 recusas sem texto', () => {
  const sealed = encryptToken(key, clinicA, secret);
  assert.match(
    sealed,
    /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/,
  );
  assert.equal(sealed.includes(secret), false);
  assert.equal(decryptToken(key, clinicA, sealed), secret);
  assert.notEqual(encryptToken(key, clinicA, secret), sealed);

  const rejected = [
    () => decryptToken(key, clinicB, sealed),
    () => decryptToken(key, clinicA, tamper(sealed, 1)),
    () => decryptToken(key, clinicA, tamper(sealed, 2)),
    () => decryptToken(key, clinicA, tamper(sealed, 3)),
    () => decryptToken(key, clinicA, `v2${sealed.slice(2)}`),
  ];
  for (const attempt of rejected) {
    assert.throws(attempt, (error: unknown) => {
      assert.ok(error instanceof TokenCipherError);
      assert.equal(String(error).includes(secret), false);
      return true;
    });
  }
});
