import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { PushService } from './push/push.service';
import { PushChannelAdapter } from './push/push.adapter';
import { PushController } from './push/push.controller';
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
 * ficam `sem_canal` em vez de fingir que enviaram. Push exige VAPID configurado.
 *
 * `EmailService` e `WhatsappService` são exportados para as outras mensagens do
 * produto: e-mails de reserva, renovação e agenda (`email/email-templates.ts`) e o
 * código de verificação do telefone.
 */
@Module({
  imports: [PatientsModule],
  controllers: [WhatsappDemoController, PushController],
  providers: [
    EmailService,
    EmailChannelAdapter,
    PushService,
    PushChannelAdapter,
    WhatsappService,
    WhatsappChannelAdapter,
    {
      provide: CHANNEL_ADAPTERS,
      inject: [
        PushService,
        PushChannelAdapter,
        EmailService,
        EmailChannelAdapter,
        WhatsappService,
        WhatsappChannelAdapter,
      ],
      useFactory: (
        push: PushService,
        pushAdapter: PushChannelAdapter,
        email: EmailService,
        emailAdapter: EmailChannelAdapter,
        whatsapp: WhatsappService,
        whatsappAdapter: WhatsappChannelAdapter,
      ): ChannelAdapter[] => [
        ...(push.isConfigured() ? [pushAdapter] : []),
        ...(email.isConfigured() ? [emailAdapter] : []),
        ...(whatsapp.isEnabled() ? [whatsappAdapter] : []),
      ],
    },
    NotificationsService,
  ],
  exports: [NotificationsService, EmailService, WhatsappService],
})
export class NotificationsModule {}
