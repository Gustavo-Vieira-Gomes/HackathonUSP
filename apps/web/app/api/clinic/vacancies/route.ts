import { proxyToApi } from '@/core/shared/services/api-proxy.service';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return proxyToApi(request, '/api/clinic/vacancies');
}

export function POST(request: Request): Promise<Response> {
  return proxyToApi(request, '/api/clinic/vacancies');
}
