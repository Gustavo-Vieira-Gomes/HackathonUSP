import 'server-only';
import {
  type ClinicSettings,
  clinicSettingsSchema,
  type ExamCatalogItem,
  examCatalogSchema,
  type Exam,
  examListSchema,
} from '@hackathon/contracts';
import {
  type ApiCallOptions,
  apiBaseUrl,
} from '@/core/shared/services/api-proxy.service';

export const CLINIC_EXAMS_TIMEOUT_MS = 5_000;

export type ReadResult<T> = { ok: true; data: T } | { ok: false };

/**
 * `GET` no Nest com o cookie da sessão, validado pelo schema do contrato. Status
 * ≠ 200, timeout, falha de rede ou corpo fora do contrato → `{ ok: false }`, para a
 * tela mostrar indisponibilidade em vez de lista vazia.
 */
/** O que a leitura usa de um schema dos contratos. */
interface ResponseSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

async function readApi<T>(
  path: string,
  schema: ResponseSchema<T>,
  cookieHeader: string,
  options: ApiCallOptions,
): Promise<ReadResult<T>> {
  try {
    const response = await fetch(
      new URL(path, options.baseUrl ?? apiBaseUrl()),
      {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
        signal: AbortSignal.timeout(
          options.timeoutMs ?? CLINIC_EXAMS_TIMEOUT_MS,
        ),
      },
    );
    if (response.status !== 200) return { ok: false };
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function getClinicExams(
  cookieHeader: string,
  options: ApiCallOptions = {},
): Promise<ReadResult<Exam[]>> {
  const result = await readApi(
    '/api/clinic/exams',
    examListSchema,
    cookieHeader,
    options,
  );
  return result.ok ? { ok: true, data: result.data.exams } : result;
}

export async function getExamCatalog(
  cookieHeader: string,
  options: ApiCallOptions = {},
): Promise<ReadResult<ExamCatalogItem[]>> {
  const result = await readApi(
    '/api/clinic/exam-catalog',
    examCatalogSchema,
    cookieHeader,
    options,
  );
  return result.ok ? { ok: true, data: result.data.items } : result;
}

export function getClinicSettings(
  cookieHeader: string,
  options: ApiCallOptions = {},
): Promise<ReadResult<ClinicSettings>> {
  return readApi(
    '/api/clinic/settings',
    clinicSettingsSchema,
    cookieHeader,
    options,
  );
}
