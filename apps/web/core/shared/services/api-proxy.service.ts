import 'server-only';

/** Tempo máximo de espera pelo Nest no repasse de /api/auth e /api/sign-up. */
export const API_PROXY_TIMEOUT_MS = 10_000;

const REQUEST_HEADERS = [
  'accept',
  'content-type',
  'cookie',
  'origin',
  'user-agent',
  'x-forwarded-for',
];
const RESPONSE_HEADERS = ['cache-control', 'content-type', 'location'];

export interface ApiCallOptions {
  /** Padrão: `API_BASE_URL`, lido em tempo de execução. */
  baseUrl?: string;
  timeoutMs?: number;
}

export function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
}

/**
 * Repassa a requisição do navegador ao Nest (método, corpo, cookie e origem) e
 * devolve status, corpo e `set-cookie` do Nest, para o cookie de sessão ficar no
 * domínio do Next. Timeout → 504; falha de conexão → 502.
 */
export async function proxyToApi(
  request: Request,
  path: string,
  options: ApiCallOptions = {},
): Promise<Response> {
  const target = new URL(path, options.baseUrl ?? apiBaseUrl());
  target.search = new URL(request.url).search;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? API_PROXY_TIMEOUT_MS),
    });
    const body = await upstream.arrayBuffer();
    const responseHeaders = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) {
      responseHeaders.append('set-cookie', cookie);
    }
    return new Response(body.byteLength > 0 ? body : null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return Response.json(
      timedOut
        ? { code: 'API_TIMEOUT', message: 'A API não respondeu a tempo.' }
        : { code: 'API_UNAVAILABLE', message: 'A API está indisponível.' },
      {
        status: timedOut ? 504 : 502,
        headers: { 'cache-control': 'no-store' },
      },
    );
  }
}
