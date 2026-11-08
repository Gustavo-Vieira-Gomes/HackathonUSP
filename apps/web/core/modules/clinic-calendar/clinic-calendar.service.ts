import 'server-only';
import {
  type GoogleCalendarConnection,
  type GoogleCalendarItem,
  googleCalendarConnectionSchema,
  googleCalendarConnectResponseSchema,
  googleCalendarListSchema,
} from '@hackathon/contracts';
import {
  type ApiCallOptions,
  apiBaseUrl,
} from '@/core/shared/services/api-proxy.service';

/** Espera pelo Nest; a listagem inclui a chamada ao Google (até 10 s). */
export const CLINIC_CALENDAR_TIMEOUT_MS = 15_000;

const BASE = '/api/clinic/google-calendar';

export type ConnectionResult =
  | { kind: 'ok'; connection: GoogleCalendarConnection }
  | { kind: 'unavailable' }
  | { kind: 'error' };

export type CalendarsResult =
  { ok: true; calendars: GoogleCalendarItem[] } | { ok: false };

export type ConnectResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'unavailable' }
  | { kind: 'error' };

export type SelectResult = { ok: true } | { ok: false; code: string };

async function callApi(
  method: string,
  path: string,
  cookieHeader: string,
  options: ApiCallOptions,
  body?: unknown,
): Promise<Response> {
  return fetch(new URL(path, options.baseUrl ?? apiBaseUrl()), {
    method,
    headers: {
      cookie: cookieHeader,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(
      options.timeoutMs ?? CLINIC_CALENDAR_TIMEOUT_MS,
    ),
  });
}

async function isUnavailable(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  const body = (await response.json().catch(() => null)) as {
    code?: unknown;
  } | null;
  return body?.code === 'GOOGLE_CALENDAR_UNAVAILABLE';
}

/** Status da conexão para a tela; falha, timeout ou corpo fora do contrato → `error`. */
export async function getCalendarConnection(
  cookieHeader: string,
  options: ApiCallOptions = {},
): Promise<ConnectionResult> {
  try {
    const response = await callApi('GET', BASE, cookieHeader, options);
    if (await isUnavailable(response)) return { kind: 'unavailable' };
    if (response.status !== 200) return { kind: 'error' };
    const parsed = googleCalendarConnectionSchema.safeParse(
      await response.json(),
    );
    return parsed.success
      ? { kind: 'ok', connection: parsed.data }
      : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export async function getOwnedCalendars(
  cookieHeader: string,
  options: ApiCallOptions = {},
): Promise<CalendarsResult> {
  try {
    const response = await callApi(
      'GET',
      `${BASE}/calendars`,
      cookieHeader,
      options,
    );
    if (response.status !== 200) return { ok: false };
    const parsed = googleCalendarListSchema.safeParse(await response.json());
    return parsed.success
      ? { ok: true, calendars: parsed.data.calendars }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Serviço da Server Action de conectar: a URL do Google só sai dentro do contrato. */
export async function startGoogleCalendarConnect(
  cookieHeader: string,
  options: ApiCallOptions = {},
): Promise<ConnectResult> {
  try {
    const response = await callApi(
      'POST',
      `${BASE}/connect`,
      cookieHeader,
      options,
    );
    if (await isUnavailable(response)) return { kind: 'unavailable' };
    if (response.status !== 200) return { kind: 'error' };
    const parsed = googleCalendarConnectResponseSchema.safeParse(
      await response.json(),
    );
    return parsed.success
      ? { kind: 'redirect', url: parsed.data.authorizationUrl }
      : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

/** Serviço da Server Action de escolher a agenda: só 200 no contrato é sucesso. */
export async function selectGoogleCalendar(
  cookieHeader: string,
  calendarId: string,
  options: ApiCallOptions = {},
): Promise<SelectResult> {
  try {
    const response = await callApi(
      'PUT',
      `${BASE}/calendar`,
      cookieHeader,
      options,
      { calendarId },
    );
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 200) {
      return googleCalendarConnectionSchema.safeParse(body).success
        ? { ok: true }
        : { ok: false, code: 'INVALID_RESPONSE' };
    }
    const code =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as { code?: unknown }).code === 'string'
        ? (body as { code: string }).code
        : `HTTP_${response.status}`;
    return { ok: false, code };
  } catch {
    return { ok: false, code: 'API_UNAVAILABLE' };
  }
}
