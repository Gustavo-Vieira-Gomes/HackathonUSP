import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CHANNEL_ADAPTERS,
  type AlertContext,
  type ChannelAdapter,
  type NotificationChannel,
  type NotificationMessage,
  type NotificationRecipient,
} from './notification.types';

export const CHANNEL_TIMEOUT_MS = 5_000;

export interface ChannelOutcome {
  channel: NotificationChannel;
  result: 'enviado' | 'falhou' | 'duplicado' | 'sem_adapter';
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

/**
 * Despacha o alerta para os canais ativos do paciente (RN-35, RN-36). Cada canal
 * roda isolado: falha ou tempo esgotado de um não impede os outros, e o resultado
 * de cada um fica em `Alert`. A unicidade (vaga, inscrição, canal) do banco garante
 * no máximo um alerta por canal, mesmo com chamadas repetidas ou concorrentes.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly adapters: Map<NotificationChannel, ChannelAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_ADAPTERS) adapters: ChannelAdapter[],
  ) {
    this.adapters = new Map(
      adapters.map((adapter) => [adapter.channel, adapter]),
    );
  }

  async enviar(
    recipient: NotificationRecipient,
    message: NotificationMessage,
    context: AlertContext,
  ): Promise<ChannelOutcome[]> {
    const channels = [...new Set(recipient.channels)];
    return Promise.all(
      channels.map((channel) =>
        this.sendOnChannel(channel, recipient, message, context),
      ),
    );
  }

  private async sendOnChannel(
    channel: NotificationChannel,
    recipient: NotificationRecipient,
    message: NotificationMessage,
    context: AlertContext,
  ): Promise<ChannelOutcome> {
    const adapter = this.adapters.get(channel);
    if (!adapter) return { channel, result: 'sem_adapter' };

    let alertId: string;
    try {
      const alert = await this.prisma.alert.create({
        data: { ...context, channel, result: 'pendente' },
        select: { id: true },
      });
      alertId = alert.id;
    } catch (error) {
      if (isUniqueViolation(error)) return { channel, result: 'duplicado' };
      throw error;
    }

    const sent = await this.callAdapter(adapter, recipient, message);
    await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        result: sent ? 'enviado' : 'falhou',
        sentAt: sent ? new Date() : null,
      },
    });
    return { channel, result: sent ? 'enviado' : 'falhou' };
  }

  private async callAdapter(
    adapter: ChannelAdapter,
    recipient: NotificationRecipient,
    message: NotificationMessage,
  ): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHANNEL_TIMEOUT_MS);
    try {
      await Promise.race([
        adapter.send(recipient, message, controller.signal),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener('abort', () =>
            reject(
              new Error(
                `canal ${adapter.channel} excedeu ${CHANNEL_TIMEOUT_MS} ms`,
              ),
            ),
          ),
        ),
      ]);
      return true;
    } catch (error) {
      // Só o canal e a causa: a mensagem e o contato do paciente não vão para o log.
      this.logger.warn(
        `falha no canal ${adapter.channel}: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
