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

export interface NotificationRecipient {
  patientId: string;
  /** Canais ativos do paciente. Guardar a preferência fica para o card que a cria. */
  channels: readonly NotificationChannel[];
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
    message: NotificationMessage,
    signal: AbortSignal,
  ): Promise<void>;
}

export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');
