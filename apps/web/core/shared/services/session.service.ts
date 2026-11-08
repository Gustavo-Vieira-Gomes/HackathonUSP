import 'server-only';
import { type SessionUser, sessionUserSchema } from '@hackathon/contracts';
import { type ApiCallOptions, apiBaseUrl } from './api-proxy.service';

export const SESSION_TIMEOUT_MS = 5_000;

/**
 * Usuário da sessão para Server Components: chama `GET /api/me` no Nest com o
 * cookie da requisição recebida. 401, falha, timeout ou resposta fora do contrato
 * contam como sem sessão (`null`), sem quebrar a renderização.
 */
export async function getSessionUser(
  cookieHeader: string | null | undefined,
  options: ApiCallOptions = {},
): Promise<SessionUser | null> {
  if (!cookieHeader) return null;
  try {
    const response = await fetch(
      new URL('/api/me', options.baseUrl ?? apiBaseUrl()),
      {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
        signal: AbortSignal.timeout(options.timeoutMs ?? SESSION_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const parsed = sessionUserSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
