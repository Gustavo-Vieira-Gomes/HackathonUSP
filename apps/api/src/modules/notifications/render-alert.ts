import type { NotificationMessage, RenderedAlert } from './notification.types';

const TIME_ZONE = 'America/Sao_Paulo';

const when = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const km = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/**
 * Monta o texto do alerta de vaga uma vez só (HACK-34): clínica, exame, horário no
 * fuso da clínica, preço atual, distância, preparo e link. Todos os canais usam
 * este texto; o adapter só adapta ao formato do fornecedor.
 */
export function renderAlert(message: NotificationMessage): RenderedAlert {
  const lines = [
    `${message.examName} em ${message.clinicName}`,
    `${when.format(message.startsAt)} · ${money.format(message.priceCents / 100)} · ${km.format(message.distanceMeters / 1000)} km`,
  ];
  if (message.preparation) lines.push(`Preparo: ${message.preparation}`);
  lines.push(message.vacancyUrl);
  return {
    title: `Vaga de ${message.examName}`,
    body: lines.join('\n'),
    url: message.vacancyUrl,
  };
}
