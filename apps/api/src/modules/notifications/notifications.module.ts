import { Module } from '@nestjs/common';
import { EmailChannelAdapter } from './email/email.adapter';
import { EmailService } from './email/email.service';
import { CHANNEL_ADAPTERS, type ChannelAdapter } from './notification.types';
import { NotificationsService } from './notifications.service';

/**
 * Canais do alerta de vaga. Cada adapter só entra quando o fornecedor está
 * configurado: sem `RESEND_API_KEY`, o e-mail responde `sem_adapter` em vez de
 * fingir que enviou. Push (4.2) e WhatsApp (4.4) entram aqui nos cards deles.
 *
 * `EmailService` é exportado para os outros e-mails do produto (confirmação e
 * cancelamento de reserva, renovação, agenda desconectada), com os templates de
 * `email/email-templates.ts`.
 */
@Module({
  providers: [
    EmailService,
    EmailChannelAdapter,
    {
      provide: CHANNEL_ADAPTERS,
      inject: [EmailService, EmailChannelAdapter],
      useFactory: (
        email: EmailService,
        emailAdapter: EmailChannelAdapter,
      ): ChannelAdapter[] => (email.isConfigured() ? [emailAdapter] : []),
    },
    NotificationsService,
  ],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
