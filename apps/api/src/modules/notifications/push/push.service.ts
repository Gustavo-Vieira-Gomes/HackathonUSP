import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PushSubscriptionBody } from '@hackathon/contracts';
import webpush from 'web-push';
import { APP_ENV, type AppEnv } from '../../../config/env';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ChannelUnavailableError,
  type RenderedAlert,
} from '../notification.types';

@Injectable()
export class PushService {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly prisma: PrismaService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.env.VAPID_PUBLIC_KEY &&
      this.env.VAPID_PRIVATE_KEY &&
      this.env.VAPID_SUBJECT,
    );
  }

  publicKey(): string | null {
    return this.isConfigured() ? (this.env.VAPID_PUBLIC_KEY ?? null) : null;
  }

  async register(patientId: string, body: PushSubscriptionBody): Promise<void> {
    if (!this.isConfigured())
      throw new ServiceUnavailableException('Push indisponível.');
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      // A subscription pertence ao navegador: ao trocar a conta, deixa de receber
      // dados da conta anterior nesse mesmo dispositivo.
      update: { patientId, p256dh: body.keys.p256dh, auth: body.keys.auth },
      create: {
        patientId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
    });
  }

  async unregister(patientId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { patientId, endpoint },
    });
  }

  async send(
    patientId: string,
    notification: RenderedAlert,
    signal: AbortSignal,
    alertId: string,
  ): Promise<void> {
    if (!this.isConfigured()) throw new ChannelUnavailableError();
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { patientId },
    });
    if (!subscriptions.length) throw new ChannelUnavailableError();
    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        if (signal.aborted) throw new Error('Push cancelado.');
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify({ ...notification, tag: alertId }),
            {
              vapidDetails: {
                subject: this.env.VAPID_SUBJECT!,
                publicKey: this.env.VAPID_PUBLIC_KEY!,
                privateKey: this.env.VAPID_PRIVATE_KEY!,
              },
              timeout: 4000,
              TTL: 300,
              topic: createHash('sha256')
                .update(alertId)
                .digest('base64url')
                .slice(0, 32),
            },
          );
          return 'sent';
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'statusCode' in error &&
            (error.statusCode === 404 || error.statusCode === 410)
          ) {
            await this.prisma.pushSubscription.deleteMany({
              where: { id: subscription.id, patientId },
            });
            return 'gone';
          }
          // O erro do fornecedor pode conter o endpoint e o payload de saúde.
          return 'failed';
        }
      }),
    );
    if (results.includes('sent')) return;
    if (results.every((result) => result === 'gone'))
      throw new ChannelUnavailableError();
    throw new Error('Falha no serviço de push.');
  }
}
