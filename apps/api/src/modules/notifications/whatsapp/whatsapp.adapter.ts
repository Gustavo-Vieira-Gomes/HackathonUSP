import { Injectable } from '@nestjs/common';
import type {
  ChannelAdapter,
  DeliveryInfo,
  NotificationRecipient,
  OutgoingNotification,
} from '../notification.types';
import { WhatsappService } from './whatsapp.service';

/**
 * Canal de WhatsApp do alerta de vaga (HACK-37): o mesmo texto de `renderAlert`,
 * com o link da vaga, para o telefone verificado. O `NotificationsService` só chama
 * este canal quando o paciente tem telefone verificado; o tempo limite de 5 s e o
 * isolamento de falha vêm dele.
 */
@Injectable()
export class WhatsappChannelAdapter implements ChannelAdapter {
  readonly channel = 'whatsapp' as const;

  constructor(private readonly whatsapp: WhatsappService) {}

  async send(
    recipient: NotificationRecipient,
    notification: OutgoingNotification,
    _signal: AbortSignal,
    delivery: DeliveryInfo,
  ): Promise<void> {
    if (!recipient.verifiedPhone) {
      throw new Error('paciente sem telefone verificado');
    }
    await this.whatsapp.sendText({
      patientId: recipient.patientId,
      phone: recipient.verifiedPhone,
      kind: 'alerta',
      body: `*${notification.title}*\n${notification.body}`,
      alertId: delivery.alertId,
    });
  }
}
