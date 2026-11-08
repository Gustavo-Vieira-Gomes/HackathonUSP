import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { allowedExams } from '@hackathon/contracts';
import { APP_ENV, type AppEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../clock/clock.service';
import { EmailService } from '../notifications/email/email.service';
import { subscriptionRenewalEmail } from '../notifications/email/email-templates';

@Injectable()
export class SubscriptionExpiryJob {
  private readonly logger = new Logger(SubscriptionExpiryJob.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly email: EmailService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Cron('0 * * * * *', { name: 'subscription-expiry', waitForCompletion: true })
  async run(): Promise<void> {
    if (!this.email.isConfigured()) return;
    await this.clock.refresh();
    const now = this.clock.now();
    const expired = await this.prisma.subscription.findMany({
      where: { expiresAt: { lte: now }, expirationEmailSentAt: null },
      include: { patient: { include: { user: true } } },
    });
    for (const row of expired) {
      const renewUrl = new URL(
        `/paciente/inscricoes?renovar=${row.id}`,
        this.env.WEB_ORIGIN,
      ).href;
      try {
        await this.email.send(
          {
            to: row.patient.user.email,
            ...subscriptionRenewalEmail({
              patientName: row.patient.user.name,
              examName:
                allowedExams.find((exam) => exam.tussCode === row.tussCode)
                  ?.name ?? 'exame',
              expiresAt: row.expiresAt,
              renewUrl,
            }),
          },
          {
            idempotencyKey: `subscription-expiry/${row.id}/${row.expiresAt.getTime()}`,
          },
        );
        // Renovação concorrente não recebe a marca do ciclo anterior.
        await this.prisma.subscription.updateMany({
          where: {
            id: row.id,
            expiresAt: row.expiresAt,
            expirationEmailSentAt: null,
          },
          data: { expirationEmailSentAt: now },
        });
      } catch {
        this.logger.warn(
          'E-mail de renovação não enviado; será tentado no próximo ciclo.',
        );
      }
    }
  }
}
