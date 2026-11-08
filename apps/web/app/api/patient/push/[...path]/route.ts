import { proxyToApi } from '@/core/shared/services/api-proxy.service';

export const dynamic = 'force-dynamic';

async function handler(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path.length !== 1 || !['key', 'subscriptions'].includes(path[0] ?? '')) {
    return new Response(null, { status: 404 });
  }
  return proxyToApi(request, `/api/patient/push/${path[0]}`);
}

export { handler as GET, handler as POST, handler as DELETE };
