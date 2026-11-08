import 'server-only';
import { type ClinicProfile, clinicProfileSchema } from '@hackathon/contracts';
import {
  type ApiCallOptions,
  apiBaseUrl,
} from '@/core/shared/services/api-proxy.service';

export const CLINIC_PROFILE_TIMEOUT_MS = 5_000;

export type ClinicProfileResult =
  { ok: true; profile: ClinicProfile } | { ok: false; status?: number };

/**
 * Perfil da clínica da sessão (`GET /api/clinic/me`) para Server Components.
 * Status ≠ 200, timeout, falha de rede ou corpo fora do contrato → `{ ok: false }`,
 * para a tela mostrar indisponibilidade em vez de dados vazios.
 */
export async function getClinicProfile(
  cookieHeader: string,
  options: ApiCallOptions = {},
): Promise<ClinicProfileResult> {
  try {
    const response = await fetch(
      new URL('/api/clinic/me', options.baseUrl ?? apiBaseUrl()),
      {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
        signal: AbortSignal.timeout(
          options.timeoutMs ?? CLINIC_PROFILE_TIMEOUT_MS,
        ),
      },
    );
    if (response.status === 403) {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === 'object' &&
        'code' in body &&
        body.code === 'CLINIC_PROFILE_MISSING'
      )
        return { ok: false };
    }
    if (response.status !== 200) return { ok: false, status: response.status };
    const parsed = clinicProfileSchema.safeParse(await response.json());
    return parsed.success ? { ok: true, profile: parsed.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}
