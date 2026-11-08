import { proxyToApi } from '@/core/shared/services/api-proxy.service';

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/** Edição de exame da clínica: repassa ao Nest, que responde 404 para exame de outra clínica. */
export async function PUT(
  request: Request,
  { params }: Context,
): Promise<Response> {
  const { id } = await params;
  return proxyToApi(request, `/api/clinic/exams/${encodeURIComponent(id)}`);
}
