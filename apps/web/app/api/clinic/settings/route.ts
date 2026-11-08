import { proxyToApi } from '@/core/shared/services/api-proxy.service';

export const dynamic = 'force-dynamic';

/** Sinal e teto diário da clínica: repassa ao Nest. */
export function PATCH(request: Request): Promise<Response> {
  return proxyToApi(request, '/api/clinic/settings');
}
