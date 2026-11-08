import 'server-only';
import type { SessionUser } from '@hackathon/contracts';
import { getSessionUser } from '@/core/shared/services/session.service';
import {
  type CalendarsResult,
  type ConnectionResult,
  getCalendarConnection,
  getOwnedCalendars,
} from './clinic-calendar.service';
import {
  type ClinicCalendarView,
  clinicCalendarView,
} from './clinic-calendar-view';

export type ClinicCalendarPage =
  | { kind: 'redirect'; to: '/clinica/login' }
  | { kind: 'not-clinic' }
  | { kind: 'view'; view: ClinicCalendarView };

interface PageDeps {
  getSessionUser: (cookie: string) => Promise<SessionUser | null>;
  getCalendarConnection: (cookie: string) => Promise<ConnectionResult>;
  getOwnedCalendars: (cookie: string) => Promise<CalendarsResult>;
}

/** Sem sessão → login; paciente → aviso; clínica → status (e agendas, se falta escolher). */
export async function loadClinicCalendarPage(
  cookieHeader: string,
  google: string | undefined,
  action: string | undefined,
  deps: PageDeps = { getSessionUser, getCalendarConnection, getOwnedCalendars },
): Promise<ClinicCalendarPage> {
  const user = await deps.getSessionUser(cookieHeader);
  if (!user) return { kind: 'redirect', to: '/clinica/login' };
  if (user.role !== 'clinica') return { kind: 'not-clinic' };
  const load = await deps.getCalendarConnection(cookieHeader);
  const calendars =
    load.kind === 'ok' && load.connection.status === 'awaiting_calendar'
      ? await deps.getOwnedCalendars(cookieHeader)
      : undefined;
  return {
    kind: 'view',
    view: clinicCalendarView(load, calendars, google, action),
  };
}
