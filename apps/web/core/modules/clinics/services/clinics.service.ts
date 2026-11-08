import 'server-only';
import {
  clinicsResponseSchema,
  type ClinicsResponse,
} from '@hackathon/contracts';
import {
  apiBaseUrl,
  type ApiCallOptions,
} from '@/core/shared/services/api-proxy.service';

type SearchResult =
  | { status: 'ok'; clinics: ClinicsResponse['clinics'] }
  | { status: 'invalid' }
  | { status: 'error' };

/** Consulta pública no Nest; falhas nunca são substituídas por dados locais. */
export async function searchClinics(
  q: string,
  options: ApiCallOptions = {},
): Promise<SearchResult> {
  try {
    const url = new URL('/api/clinics', options.baseUrl ?? apiBaseUrl());
    url.searchParams.set('q', q);
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
    });
    if (response.status === 400) return { status: 'invalid' };
    if (!response.ok) return { status: 'error' };
    const parsed = clinicsResponseSchema.safeParse(await response.json());
    return parsed.success
      ? { status: 'ok', clinics: parsed.data.clinics }
      : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}
