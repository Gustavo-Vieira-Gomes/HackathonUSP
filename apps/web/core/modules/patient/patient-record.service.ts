import 'server-only';
import {
  type PatientReservation,
  type PatientSubscription,
  patientReservationSchema,
  patientSubscriptionSchema,
} from '@hackathon/contracts';
import {
  type ApiCallOptions,
  apiBaseUrl,
} from '@/core/shared/services/api-proxy.service';

export type PatientRecordResult<T> =
  | { kind: 'ok'; record: T }
  | { kind: 'not-found' | 'unauthenticated' | 'error' };

async function getRecord<T>(
  path: string,
  cookie: string,
  schema: {
    safeParse: (
      data: unknown,
    ) => { success: true; data: T } | { success: false };
  },
  options: ApiCallOptions,
): Promise<PatientRecordResult<T>> {
  try {
    const response = await fetch(
      new URL(path, options.baseUrl ?? apiBaseUrl()),
      {
        headers: { cookie },
        cache: 'no-store',
        signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
      },
    );
    if (response.status === 404) return { kind: 'not-found' };
    if (response.status === 401) return { kind: 'unauthenticated' };
    if (response.status !== 200) return { kind: 'error' };
    const parsed = schema.safeParse(await response.json());
    return parsed.success
      ? { kind: 'ok', record: parsed.data }
      : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export function getPatientReservation(
  id: string,
  cookie: string,
  options: ApiCallOptions = {},
): Promise<PatientRecordResult<PatientReservation>> {
  return getRecord(
    `/api/patient/reservations/${encodeURIComponent(id)}`,
    cookie,
    patientReservationSchema,
    options,
  );
}

export function getPatientSubscription(
  id: string,
  cookie: string,
  options: ApiCallOptions = {},
): Promise<PatientRecordResult<PatientSubscription>> {
  return getRecord(
    `/api/patient/subscriptions/${encodeURIComponent(id)}`,
    cookie,
    patientSubscriptionSchema,
    options,
  );
}
