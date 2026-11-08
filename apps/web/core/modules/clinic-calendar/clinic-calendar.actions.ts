'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  selectGoogleCalendar,
  startGoogleCalendarConnect,
} from './clinic-calendar.service';

/** Botão "Conectar Google Agenda": leva o navegador ao consentimento do Google. */
export async function connectGoogleCalendarAction(): Promise<void> {
  const result = await startGoogleCalendarConnect((await cookies()).toString());
  if (result.kind === 'redirect') redirect(result.url);
  redirect(
    result.kind === 'unavailable'
      ? '/clinica/agenda'
      : '/clinica/agenda?acao=conectar',
  );
}

/** Botão "Usar esta agenda". */
export async function selectGoogleCalendarAction(
  formData: FormData,
): Promise<void> {
  const calendarId = formData.get('calendarId');
  if (typeof calendarId !== 'string' || !calendarId) {
    redirect('/clinica/agenda?acao=agenda');
  }
  const result = await selectGoogleCalendar(
    (await cookies()).toString(),
    calendarId,
  );
  redirect(result.ok ? '/clinica/agenda' : '/clinica/agenda?acao=agenda');
}
