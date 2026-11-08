import { proxyToApi } from '@/core/shared/services/api-proxy.service';

export const dynamic = 'force-dynamic';

/**
 * Volta do consentimento do Google (`GOOGLE_OAUTH_REDIRECT_URI`). Fica no Next
 * porque o cookie de sessão mora nesta origem; repassa `code`, `state`, `error` e o
 * cookie ao Nest, que responde 302 para `/clinica/agenda?google=<resultado>`.
 */
export async function GET(request: Request): Promise<Response> {
  const cookie = request.headers.get('cookie') ?? '';
  if (!cookie.includes('session_token=')) {
    return Response.redirect(new URL('/clinica/login', request.url), 302);
  }
  return proxyToApi(request, '/api/clinic/google-calendar/callback');
}
