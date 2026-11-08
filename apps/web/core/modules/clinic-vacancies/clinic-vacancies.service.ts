import 'server-only';
import {
  clinicVacanciesSchema,
  type ClinicVacancies,
} from '@hackathon/contracts';
import {
  apiBaseUrl,
  type ApiCallOptions,
} from '@/core/shared/services/api-proxy.service';
import type { ReadResult } from '../clinic-exams/clinic-exams.service';

export async function getClinicVacancies(
  cookieHeader: string,
  options: ApiCallOptions = {},
): Promise<ReadResult<ClinicVacancies>> {
  try {
    const response = await fetch(
      new URL('/api/clinic/vacancies', options.baseUrl ?? apiBaseUrl()),
      {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
        signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      },
    );
    if (!response.ok) return { ok: false };
    const parsed = clinicVacanciesSchema.safeParse(await response.json());
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}
