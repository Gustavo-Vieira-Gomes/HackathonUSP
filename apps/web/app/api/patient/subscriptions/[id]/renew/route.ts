import { proxyToApi } from '@/core/shared/services/api-proxy.service';

export function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return params.then(({ id }) =>
    proxyToApi(
      request,
      `/api/patient/subscriptions/${encodeURIComponent(id)}/renew`,
    ),
  );
}
