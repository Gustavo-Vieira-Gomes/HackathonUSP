import { Injectable } from '@nestjs/common';
import type {
  ChannelAdapter,
  DeliveryInfo,
  NotificationRecipient,
  OutgoingNotification,
} from '../notification.types';
import { vacancyAlertEmail } from './email-templates';
import { EmailService } from './email.service';

/**
 * Canal de e-mail do alerta de vaga (HACK-36). A chave de idempotência é o id do
 * `Alert`: a retentativa do `EmailService` e o reenvio de um pendente abandonado
 * (HACK-45) caem no mesmo e-mail no Resend.
 */
@Injectable()
export class EmailChannelAdapter implements ChannelAdapter {
  readonly channel = 'email' as const;

  constructor(private readonly email: EmailService) {}

  async send(
    recipient: NotificationRecipient,
    notification: OutgoingNotification,
    signal: AbortSignal,
    delivery: DeliveryInfo,
  ): Promise<void> {
    await this.email.send(
      { to: recipient.email, ...vacancyAlertEmail(notification) },
      { idempotencyKey: `alert-${delivery.alertId}`, signal },
    );
  }
}
