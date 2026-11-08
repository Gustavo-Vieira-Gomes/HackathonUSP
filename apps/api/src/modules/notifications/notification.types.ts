export const NOTIFICATION_CHANNELS = ['push', 'email', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Conteúdo do alerta, montado uma vez e entregue igual a todos os canais (RN-35). */
export interface NotificationMessage {
  clinicName: string;
  examName: string;
  startsAt: Date;
  priceCents: number;
  distanceMeters: number;
  preparation: string | null;
  vacancyUrl: string;
}

/**
 * Destinatário resolvido pelo `NotificationsService` a partir do `Patient`: quem
 * chama passa só o id do paciente, nunca contato nem canais.
 */
export interface NotificationRecipient {
  patientId: string;
  /** Id do `User`, para a sala de tempo real e as subscriptions de push. */
  userId: string;
  name: string;
  email: string;
  /** Só preenchido com o telefone verificado; sem isso o WhatsApp não é usado. */
  verifiedPhone: string | null;
  /** Canais que o paciente ativou, na ordem da preferência. */
  preferredChannels: readonly NotificationChannel[];
  /** Canais efetivos: os ativados menos os que ele não pode receber. */
  channels: readonly NotificationChannel[];
}

/** Texto do alerta, montado uma vez e igual em todos os canais (HACK-34). */
export interface RenderedAlert {
  title: string;
  body: string;
  url: string;
}

/** O que cada adapter recebe: o texto pronto e os dados para formatos ricos. */
export interface OutgoingNotification extends RenderedAlert {
  message: NotificationMessage;
}

/** De qual vaga e inscrição vem o alerta; vira uma linha de `Alert` por canal (RN-36). */
export interface AlertContext {
  vacancyId: string;
  subscriptionId: string;
  wave: number;
}

/**
 * Contrato que cada fornecedor (web-push, Resend, WhatsApp) implementa. O adapter
 * traduz a mensagem para o formato do fornecedor e lança em qualquer falha;
 * `signal` aborta quando o tempo limite do canal estoura.
 */
export interface ChannelAdapter {
  readonly channel: NotificationChannel;
  send(
    recipient: NotificationRecipient,
    notification: OutgoingNotification,
    signal: AbortSignal,
    delivery: DeliveryInfo,
  ): Promise<void>;
}

/**
 * Identidade do envio num canal. `alertId` é estável entre tentativas e entre a
 * reivindicação de um pendente abandonado (HACK-45): serve de chave de
 * idempotência no fornecedor, para um reenvio não duplicar a mensagem.
 */
export interface DeliveryInfo {
  alertId: string;
}

export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');
