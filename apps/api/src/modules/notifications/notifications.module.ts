import { Module } from '@nestjs/common';
import { EmailChannelAdapter } from './email/email.adapter';
import { EmailService } from './email/email.service';
import { CHANNEL_ADAPTERS, type ChannelAdapter } from './notification.types';
import { NotificationsService } from './notifications.service';
import { WhatsappChannelAdapter } from './whatsapp/whatsapp.adapter';
import { WhatsappDemoController } from './whatsapp/whatsapp-demo.controller';
import { WhatsappService } from './whatsapp/whatsapp.service';

/**
 * Canais do alerta de vaga. Cada adapter só entra quando o fornecedor está
 * configurado: sem `RESEND_API_KEY` o e-mail, e com `WHATSAPP_MODE=off` o WhatsApp,
 * respondem `sem_adapter` em vez de fingir que enviaram. Push (4.2) entra aqui no
 * card dele.
 *
 * `EmailService` e `WhatsappService` são exportados para as outras mensagens do
 * produto: e-mails de reserva, renovação e agenda (`email/email-templates.ts`) e o
 * código de verificação do telefone.
 */
@Module({
  controllers: [WhatsappDemoController],
  providers: [
    EmailService,
    EmailChannelAdapter,
    WhatsappService,
    WhatsappChannelAdapter,
    {
      provide: CHANNEL_ADAPTERS,
      inject: [
        EmailService,
        EmailChannelAdapter,
        WhatsappService,
        WhatsappChannelAdapter,
      ],
      useFactory: (
        email: EmailService,
        emailAdapter: EmailChannelAdapter,
        whatsapp: WhatsappService,
        whatsappAdapter: WhatsappChannelAdapter,
      ): ChannelAdapter[] => [
        ...(email.isConfigured() ? [emailAdapter] : []),
        ...(whatsapp.isEnabled() ? [whatsappAdapter] : []),
      ],
    },
    NotificationsService,
  ],
  exports: [NotificationsService, EmailService, WhatsappService],
})
export class NotificationsModule {}
