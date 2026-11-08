import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CHANNEL_ADAPTERS,
  type AlertContext,
  type ChannelAdapter,
  type NotificationChannel,
  type NotificationMessage,
  type NotificationRecipient,
  type OutgoingNotification,
} from './notification.types';
import { renderAlert } from './render-alert';

export const CHANNEL_TIMEOUT_MS = 5_000;
/** Alerta pendente há mais que isso foi abandonado por um processo que caiu (HACK-45). */
export const STALE_PENDING_MS = 2 * CHANNEL_TIMEOUT_MS;

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

  /**
   * Alerta o paciente da vaga pelos canais que ele ativou. O texto é montado uma vez
   * (`renderAlert`) e entregue igual a todos os canais.
   */
  async enviar(
    patientId: string,
    message: NotificationMessage,
    context: AlertContext,
  ): Promise<ChannelOutcome[]> {
    const recipient = await this.recipientFor(patientId);
    const notification: OutgoingNotification = {
      ...renderAlert(message),
      message,
    };
    return Promise.all(
      recipient.channels.map((channel) =>
        this.sendOnChannel(channel, recipient, notification, context),
      ),
    );
  }

  /**
   * Cancela os alertas ainda pendentes de vagas que fecharam (RN-36): reservada,
   * expirada ou cancelada. Enviado e falhou ficam como estão. Chamado a cada minuto
   * pelo motor de vagas (HACK-32). Devolve quantos foram cancelados.
   */
  async cancelPendingOfClosedVacancies(): Promise<number> {
    const { count } = await this.prisma.alert.updateMany({
      where: {
        result: 'pendente',
        vacancy: { state: { in: ['reservada', 'expirada', 'cancelada'] } },
      },
      data: { result: 'cancelado' },
    });
    return count;
  }

  /**
   * Contato e canais efetivos do paciente (HACK-34). WhatsApp só entra com o
   * telefone verificado, para não mandar dado de saúde para um número errado.
   */
  async recipientFor(patientId: string): Promise<NotificationRecipient> {
    const patient = await this.prisma.patient.findUniqueOrThrow({
      where: { id: patientId },
      select: {
        id: true,
        phone: true,
        phoneVerifiedAt: true,
        alertChannels: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    const verifiedPhone = patient.phoneVerifiedAt ? patient.phone : null;
    const channels = [...new Set(patient.alertChannels)].filter(
      (channel) => channel !== 'whatsapp' || verifiedPhone !== null,
    );
    return {
      patientId: patient.id,
      userId: patient.user.id,
      name: patient.user.name,
      email: patient.user.email,
      verifiedPhone,
      channels,
    };
  }

  private async sendOnChannel(
    channel: NotificationChannel,
    recipient: NotificationRecipient,
    notification: OutgoingNotification,
    context: AlertContext,
  ): Promise<ChannelOutcome> {
    const adapter = this.adapters.get(channel);
    if (!adapter) return { channel, result: 'sem_adapter' };

    const alertId = await this.claimAlert(channel, context);
    if (!alertId) return { channel, result: 'duplicado' };

    const sent = await this.callAdapter(adapter, recipient, notification);
    try {
      await this.prisma.alert.update({
        where: { id: alertId },
        data: {
          result: sent ? 'enviado' : 'falhou',
          sentAt: sent ? new Date() : null,
        },
      });
    } catch (error) {
      // O envio já aconteceu; o Alert fica pendente e é reivindicado depois de
      // STALE_PENDING_MS. Preferimos reenviar uma vez a perder o alerta em silêncio.
      this.logger.error(
        `falha ao gravar resultado do alerta ${alertId} no canal ${channel}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
    return { channel, result: sent ? 'enviado' : 'falhou' };
  }

  /**
   * Reserva o direito de enviar por este canal. Cria o `Alert` pendente; se ele já
   * existe, só o reivindica quando ficou pendente por mais de STALE_PENDING_MS,
   * sinal de que o processo caiu entre gravar e enviar. O `updateMany` condicional
   * é atômico: entre duas chamadas concorrentes, só uma reivindica. Devolve o id
   * do alerta reservado, ou null quando outro envio já é dono dele.
   */
  private async claimAlert(
    channel: NotificationChannel,
    context: AlertContext,
  ): Promise<string | null> {
    try {
      const alert = await this.prisma.alert.create({
        data: { ...context, channel, result: 'pendente' },
        select: { id: true },
      });
      return alert.id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    const key = {
      vacancyId: context.vacancyId,
      subscriptionId: context.subscriptionId,
      channel,
    };
    const now = new Date();
    // createdAt passa a marcar a última reivindicação, que é o que importa aqui.
    const claimed = await this.prisma.alert.updateMany({
      where: {
        ...key,
        result: 'pendente',
        createdAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) },
      },
      data: { createdAt: now },
    });
    if (claimed.count === 0) return null;

    const alert = await this.prisma.alert.findUnique({
      where: { vacancyId_subscriptionId_channel: key },
      select: { id: true },
    });
    return alert?.id ?? null;
  }

  private async callAdapter(
    adapter: ChannelAdapter,
    recipient: NotificationRecipient,
    notification: OutgoingNotification,
  ): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHANNEL_TIMEOUT_MS);
    try {
      await Promise.race([
        adapter.send(recipient, notification, controller.signal),
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
