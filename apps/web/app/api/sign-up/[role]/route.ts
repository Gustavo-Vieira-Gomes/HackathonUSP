import { userRoleSchema } from '@hackathon/contracts';
import { proxyToApi } from '@/core/shared/services/api-proxy.service';

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ role: string }>;
}

/** Só `paciente` e `clinica`; outro valor responde 404 sem chamar o Nest. */
export async function POST(
  request: Request,
  { params }: Context,
): Promise<Response> {
  const { role } = await params;
  const parsed = userRoleSchema.safeParse(role);
  if (!parsed.success) {
    return Response.json(
      { code: 'NOT_FOUND', message: 'Cadastro inexistente.' },
      { status: 404 },
    );
  }
  return proxyToApi(request, `/api/sign-up/${parsed.data}`);
}
