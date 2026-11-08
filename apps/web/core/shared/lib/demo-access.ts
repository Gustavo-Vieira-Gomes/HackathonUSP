import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

export type DemoAccess = 'ok' | 'disabled' | 'missing' | 'denied';

/** Desafio do Basic Auth das telas de demo. */
export const DEMO_AUTH_CHALLENGE =
  'Basic realm="Demo do operador", charset="UTF-8"';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Acesso às telas `/demo/*` (HACK-37): Basic Auth com o segredo do operador
 * (`DEMO_CLOCK_TOKEN`, o mesmo da API) como senha; o usuário é ignorado. Sem o
 * segredo configurado no Next, as telas não existem.
 *
 * Usado em duas camadas: o `proxy.ts` responde 401 antes de renderizar, e cada
 * página confere de novo antes de buscar dados, porque o proxy não deve ser a
 * única barreira de autorização.
 */
export function checkDemoAccess(
  authorization: string | null | undefined,
  token: string | undefined = process.env.DEMO_CLOCK_TOKEN,
): DemoAccess {
  if (!token) return 'disabled';
  if (!authorization?.startsWith('Basic ')) return 'missing';
  let decoded: string;
  try {
    decoded = Buffer.from(authorization.slice(6).trim(), 'base64').toString(
      'utf8',
    );
  } catch {
    return 'denied';
  }
  const separator = decoded.indexOf(':');
  if (separator < 0) return 'denied';
  const password = decoded.slice(separator + 1);
  // Compara digests de mesmo tamanho em tempo constante.
  return timingSafeEqual(digest(password), digest(token)) ? 'ok' : 'denied';
}
