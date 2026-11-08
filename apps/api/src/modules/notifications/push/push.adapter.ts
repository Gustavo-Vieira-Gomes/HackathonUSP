import { Injectable } from '@nestjs/common';
import type {
  ChannelAdapter,
  DeliveryInfo,
  NotificationRecipient,
  OutgoingNotification,
} from '../notification.types';
import { PushService } from './push.service';

@Injectable()
export class PushChannelAdapter implements ChannelAdapter {
  readonly channel = 'push' as const;
  constructor(private readonly push: PushService) {}
  async send(
    recipient: NotificationRecipient,
    notification: OutgoingNotification,
    signal: AbortSignal,
    delivery: DeliveryInfo,
  ): Promise<void> {
    await this.push.send(
      recipient.patientId,
      {
        title: notification.title,
        body: notification.body,
        url: notification.url,
      },
      signal,
      delivery.alertId,
    );
  }
}
