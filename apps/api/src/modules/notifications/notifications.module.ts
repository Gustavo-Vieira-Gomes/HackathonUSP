import { Module } from '@nestjs/common';
import { CHANNEL_ADAPTERS } from './notification.types';
import { NotificationsService } from './notifications.service';

/**
 * Os adapters de push (4.2), e-mail (4.3) e WhatsApp (4.4) entram em
 * `CHANNEL_ADAPTERS` quando cada card chegar; até lá nenhum canal despacha.
 */
@Module({
  providers: [
    { provide: CHANNEL_ADAPTERS, useValue: [] },
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
