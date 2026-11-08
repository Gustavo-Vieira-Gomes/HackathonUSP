import type { GoogleCalendarItem } from '@hackathon/contracts';
import type {
  CalendarsResult,
  ConnectionResult,
} from './clinic-calendar.service';

/** O que `/clinica/agenda` mostra, decidido fora do JSX para ser testável. */
export interface ClinicCalendarView {
  /** Texto do status; ausente quando a carga falhou ou a integração está indisponível. */
  statusText?: string;
  calendarName?: string;
  showConnect: boolean;
  /** Lista de rádio para escolher a agenda (status `awaiting_calendar`). */
  calendars?: GoogleCalendarItem[];
  emptyText?: string;
  /** Mensagem fixa (indisponível, erro de carga) fora do alerta. */
  notice?: string;
  /** Mensagem em `role="alert"` vinda do `?google=` ou de uma ação. */
  alert?: string;
}

export const COPY = {
  connected: 'Conectada',
  disconnected: 'Desconectada',
  expired:
    'Agenda desconectada: a autorização expirou ou foi revogada. Reautorize.',
  awaiting: 'Autorizada. Escolha a agenda dos exames.',
  empty: 'Nenhuma agenda própria encontrada nesta conta Google',
  unavailable: 'Integração com a Google Agenda indisponível neste ambiente',
  loadError: 'Não foi possível carregar o status da agenda. Tente de novo.',
  calendarsError:
    'Não foi possível carregar as agendas da conta Google. Tente de novo.',
  connectButton: 'Conectar Google Agenda',
  useButton: 'Usar esta agenda',
} as const;

/** Resultados de erro do callback (`?google=`); sucesso e valor desconhecido não alertam. */
export const CALLBACK_ALERTS: Record<string, string> = {
  denied:
    'Você não autorizou o acesso à Google Agenda. Para conectar, autorize na tela do Google.',
  invalid_state:
    'Não foi possível confirmar a autorização (link vencido ou de outra sessão). Clique em Conectar de novo.',
  no_refresh_token:
    'O Google não concedeu acesso contínuo à agenda. Remova o acesso deste app na sua conta Google e conecte de novo.',
  google_unavailable:
    'O Google não respondeu. Tente conectar de novo em instantes.',
};

/** Falhas das Server Actions, devolvidas em `?acao=`. */
export const ACTION_ALERTS: Record<string, string> = {
  conectar: 'Não foi possível iniciar a conexão. Tente de novo.',
  agenda: 'Não foi possível usar esta agenda. Tente de novo.',
};

export function alertFor(
  google: string | undefined,
  action: string | undefined,
): string | undefined {
  return (
    (google ? CALLBACK_ALERTS[google] : undefined) ??
    (action ? ACTION_ALERTS[action] : undefined)
  );
}

export function clinicCalendarView(
  load: ConnectionResult,
  calendars: CalendarsResult | undefined,
  google?: string,
  action?: string,
): ClinicCalendarView {
  const alert = alertFor(google, action);
  if (load.kind === 'unavailable') {
    return { showConnect: false, notice: COPY.unavailable, alert };
  }
  if (load.kind === 'error') {
    return { showConnect: false, notice: COPY.loadError, alert };
  }
  const { connection } = load;
  switch (connection.status) {
    case 'connected':
      return {
        statusText: COPY.connected,
        calendarName: connection.calendarName,
        showConnect: false,
        alert,
      };
    case 'disconnected':
      return { statusText: COPY.disconnected, showConnect: true, alert };
    case 'expired':
      return { statusText: COPY.expired, showConnect: true, alert };
    case 'awaiting_calendar':
      // Lista vazia ou erro: a clínica pode ter autorizado a conta errada, então
      // oferece reautorizar (decisão do Maestro, R3).
      if (!calendars?.ok) {
        return {
          statusText: COPY.awaiting,
          showConnect: true,
          notice: COPY.calendarsError,
          alert,
        };
      }
      return calendars.calendars.length > 0
        ? {
            statusText: COPY.awaiting,
            showConnect: false,
            calendars: calendars.calendars,
            alert,
          }
        : {
            statusText: COPY.awaiting,
            showConnect: true,
            emptyText: COPY.empty,
            alert,
          };
  }
}
