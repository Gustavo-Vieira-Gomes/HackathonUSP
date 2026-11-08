import { proxyToApi } from '@/core/shared/services/api-proxy.service';

export const dynamic = 'force-dynamic';

/** Cadastro de exame da clínica: repassa ao Nest, que valida e autoriza. */
export function POST(request: Request): Promise<Response> {
  return proxyToApi(request, '/api/clinic/exams');
}
