import { proxyToApi } from '@/core/shared/services/api-proxy.service';

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ path: string[] }>;
}

async function handler(
  request: Request,
  { params }: Context,
): Promise<Response> {
  const { path } = await params;
  return proxyToApi(
    request,
    `/api/auth/${path.map(encodeURIComponent).join('/')}`,
  );
}

export { handler as GET, handler as POST };
