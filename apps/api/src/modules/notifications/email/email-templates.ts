import type { EmailMessage } from './email.service';
import type { RenderedAlert } from '../notification.types';

/** Conteúdo de um e-mail, sem o destinatário. */
export type EmailContent = Omit<EmailMessage, 'to'>;

const TIME_ZONE = 'America/Sao_Paulo';
const when = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa texto para HTML: nome de clínica e exame vêm de cadastro. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * Monta texto e HTML a partir das mesmas linhas, para os dois nunca divergirem.
 * `action` vira um botão no HTML e uma linha com o link no texto.
 */
function layout(
  subject: string,
  lines: string[],
  action?: { label: string; url: string },
): EmailContent {
  const text = [
    ...lines,
    ...(action ? ['', `${action.label}: ${action.url}`] : []),
  ].join('\n');
  const paragraphs = lines
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join('');
  const button = action
    ? `<p style="margin:20px 0"><a href="${escapeHtml(action.url)}" style="background:#0b5fff;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>`
    : '';
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(subject)}</h1>${paragraphs}${button}</body></html>`;
  return { subject, html, text };
}

/** Alerta de vaga (RN-35): o mesmo texto de `renderAlert`, com botão para a vaga. */
export function vacancyAlertEmail(alert: RenderedAlert): EmailContent {
  const lines = alert.body.split('\n').filter((line) => line !== alert.url);
  return layout(alert.title, lines, { label: 'Ver a vaga', url: alert.url });
}

export interface ReservationEmailData {
  patientName: string;
  examName: string;
  clinicName: string;
  clinicAddress: string;
  startsAt: Date;
  depositCents: number;
  reservationUrl: string;
}

/** Confirmação de reserva, depois do sinal pago. */
export function reservationConfirmedEmail(
  data: ReservationEmailData,
): EmailContent {
  return layout(
    `Reserva confirmada: ${data.examName}`,
    [
      `Olá, ${data.patientName}. Sua reserva está confirmada.`,
      `${data.examName} em ${data.clinicName}, ${when.format(data.startsAt)}.`,
      `Endereço: ${data.clinicAddress}.`,
      `Sinal pago: ${money.format(data.depositCents / 100)}.`,
    ],
    { label: 'Ver a reserva', url: data.reservationUrl },
  );
}

/** Cancelamento pela clínica (RN-48): sinal devolvido integralmente. */
export function reservationCanceledByClinicEmail(
  data: ReservationEmailData & { reason: string },
): EmailContent {
  return layout(
    `A clínica cancelou sua reserva de ${data.examName}`,
    [
      `Olá, ${data.patientName}. ${data.clinicName} cancelou o horário de ${when.format(data.startsAt)}.`,
      `Motivo: ${data.reason}.`,
      `O sinal de ${money.format(data.depositCents / 100)} será devolvido integralmente.`,
    ],
    { label: 'Ver detalhes', url: data.reservationUrl },
  );
}

export interface RenewalEmailData {
  patientName: string;
  examName: string;
  expiresAt: Date;
  renewUrl: string;
}

/** Renovação de inscrição na lista de encaixe (RN-20). */
export function subscriptionRenewalEmail(data: RenewalEmailData): EmailContent {
  return layout(
    `Sua inscrição para ${data.examName} vai expirar`,
    [
      `Olá, ${data.patientName}. Sua inscrição na lista de encaixe para ${data.examName} expira em ${when.format(data.expiresAt)}.`,
      'Renove para continuar recebendo alertas de vagas.',
    ],
    { label: 'Renovar inscrição', url: data.renewUrl },
  );
}

export interface CalendarDisconnectedEmailData {
  clinicName: string;
  reconnectUrl: string;
}

/** Aviso à clínica de agenda desconectada (token do Google expirado, HACK-19). */
export function calendarDisconnectedEmail(
  data: CalendarDisconnectedEmailData,
): EmailContent {
  return layout(
    'Sua agenda foi desconectada',
    [
      `A agenda do Google de ${data.clinicName} parou de sincronizar.`,
      'Enquanto ela estiver desconectada, horários livres e cancelamentos não viram vagas de encaixe.',
    ],
    { label: 'Reconectar agenda', url: data.reconnectUrl },
  );
}
