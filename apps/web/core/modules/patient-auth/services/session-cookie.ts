import 'server-only';

/** Nome do cookie de sessão emitido pelo Nest (AD-003); com `__Secure-` em produção HTTPS. */
const SESSION_COOKIE_SUFFIX = 'better-auth.session_token';

export interface SessionCookie {
  name: string;
  value: string;
  maxAge: number;
  secure: boolean;
}

function isSessionCookieName(name: string): boolean {
  return (
    name === SESSION_COOKIE_SUFFIX ||
    name === `__Secure-${SESSION_COOKIE_SUFFIX}`
  );
}

/**
 * Lê o cookie de sessão dos `Set-Cookie` do Nest. O valor chega codificado
 * para URL e é devolvido decodificado, porque o Next codifica ao gravar.
 */
export function parseSessionSetCookie(
  setCookies: string[],
): SessionCookie | null {
  for (const header of setCookies) {
    const [pair = '', ...attributes] = header.split(';');
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    if (!isSessionCookieName(name)) continue;

    let maxAge = 0;
    let secure = false;
    for (const attribute of attributes) {
      const [key = '', value = ''] = attribute.trim().split('=');
      if (key.toLowerCase() === 'max-age') maxAge = Number(value);
      if (key.toLowerCase() === 'secure') secure = true;
    }
    if (!Number.isFinite(maxAge)) maxAge = 0;

    let value = pair.slice(separator + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
    return { name, value, maxAge, secure };
  }
  return null;
}

interface CookieReader {
  getAll(): Array<{ name: string; value: string }>;
}

/** Cookie de sessão presente na requisição ao Next, se houver. */
export function readSessionCookie(
  store: CookieReader,
): { name: string; value: string } | null {
  return (
    store.getAll().find((cookie) => isSessionCookieName(cookie.name)) ?? null
  );
}

/** Header `Cookie` encaminhado ao Nest: só o cookie de sessão. */
export function toCookieHeader(cookie: {
  name: string;
  value: string;
}): string {
  return `${cookie.name}=${encodeURIComponent(cookie.value)}`;
}
