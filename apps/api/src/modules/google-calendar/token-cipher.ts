import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Formato do token guardado (HACK-18, porta 2): `v1.<iv>.<tag>.<cifra>`, base64url,
 * AES-256-GCM de `node:crypto` com AAD = `clinicId`. Sem AAD, um token copiado para
 * a linha de outra clínica decifraria; o prefixo deixa a rotação de chave possível.
 */
const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class TokenCipherError extends Error {
  override readonly name = 'TokenCipherError';
}

export function encryptToken(
  key: Buffer,
  clinicId: string,
  plaintext: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(clinicId, 'utf8'));
  const data = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

/** Lança `TokenCipherError` (sem detalhe do conteúdo) para formato, clínica ou dado adulterado. */
export function decryptToken(
  key: Buffer,
  clinicId: string,
  value: string,
): string {
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new TokenCipherError('Token cifrado em formato desconhecido.');
  }
  const iv = Buffer.from(parts[1] ?? '', 'base64url');
  const tag = Buffer.from(parts[2] ?? '', 'base64url');
  const data = Buffer.from(parts[3] ?? '', 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new TokenCipherError('Token cifrado em formato desconhecido.');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(clinicId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    throw new TokenCipherError('Token cifrado inválido para esta clínica.');
  }
}
