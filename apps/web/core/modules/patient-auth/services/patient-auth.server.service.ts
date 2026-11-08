import 'server-only';
import {
  type ApiError,
  apiErrorSchema,
  type Patient,
  type PatientSignUpInput,
  patientSchema,
  type SignInInput,
} from '@hackathon/contracts';
import { cookies } from 'next/headers';
import { readSessionCookie, toCookieHeader } from './session-cookie';

const API_TIMEOUT_MS = 5000;

export type ApiOutcome<T> =
  | { kind: 'ok'; data: T; setCookies: string[] }
  | { kind: 'error'; error: ApiError }
  | { kind: 'unavailable' };

export type CurrentPatient =
  | { kind: 'authenticated'; patient: Patient }
  | { kind: 'anonymous' }
  | { kind: 'unavailable' };

function apiUrl(path: string): URL {
  return new URL(path, process.env.API_BASE_URL ?? 'http://127.0.0.1:3001');
}

async function send(path: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(apiUrl(path), {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

async function readPatient(
  response: Response | null,
): Promise<ApiOutcome<Patient>> {
  if (!response || response.status >= 500) return { kind: 'unavailable' };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: 'unavailable' };
  }
  if (response.ok) {
    const patient = patientSchema.safeParse(body);
    return patient.success
      ? {
          kind: 'ok',
          data: patient.data,
          setCookies: response.headers.getSetCookie(),
        }
      : { kind: 'unavailable' };
  }
  const error = apiErrorSchema.safeParse(body);
  return error.success
    ? { kind: 'error', error: error.data }
    : { kind: 'unavailable' };
}

function postJson(path: string, body: unknown): Promise<Response | null> {
  return send(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function signUpPatient(
  input: PatientSignUpInput,
): Promise<ApiOutcome<Patient>> {
  return readPatient(await postJson('/api/patients', input));
}

export async function signInPatient(
  input: SignInInput,
): Promise<ApiOutcome<Patient>> {
  return readPatient(await postJson('/api/sessions', input));
}

/** Revoga a sessão no Nest; o chamador apaga o cookie do Next de qualquer forma. */
export async function signOutPatient(cookie: {
  name: string;
  value: string;
}): Promise<void> {
  await send('/api/sessions/current', {
    method: 'DELETE',
    headers: { cookie: toCookieHeader(cookie) },
  });
}

/** Paciente da sessão atual, consultado no Nest a cada requisição (AD-003). */
export async function getCurrentPatient(): Promise<CurrentPatient> {
  const cookie = readSessionCookie(await cookies());
  if (!cookie) return { kind: 'anonymous' };
  const response = await send('/api/patients/me', {
    headers: { cookie: toCookieHeader(cookie) },
  });
  const outcome = await readPatient(response);
  if (outcome.kind === 'ok')
    return { kind: 'authenticated', patient: outcome.data };
  if (outcome.kind === 'error' && outcome.error.code === 'unauthenticated') {
    return { kind: 'anonymous' };
  }
  return { kind: 'unavailable' };
}
