import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env';
import type { SimulatedWhatsappKind } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface WhatsappText {
  patientId: string;
  phone: string;
  kind: SimulatedWhatsappKind;
  body: string;
  /** Alerta de origem; repetir o mesmo id não gera segunda mensagem (HACK-45). */
  alertId?: string;
}

const LIST_LIMIT = 100;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

/**
 * Envio de WhatsApp do piloto (HACK-37). O escopo exclui o WhatsApp real, então o
 * único modo além de `off` é `simulated`: a mensagem é gravada em
 * `SimulatedWhatsappMessage` e aparece na tela `/demo/whatsapp`. Com `off`, enviar
 * responde 503, em vez de fingir que a mensagem saiu.
 *
 * A integração real (Evolution/WAHA) entraria aqui, no mesmo `sendText`.
 */
@Injectable()
export class WhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  isEnabled(): boolean {
    return this.env.WHATSAPP_MODE === 'simulated';
  }

  /** 503 com `WHATSAPP_UNAVAILABLE` quando o WhatsApp está desligado. */
  assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_UNAVAILABLE',
        message: 'WhatsApp indisponível no momento.',
      });
    }
  }

  async sendText(text: WhatsappText): Promise<void> {
    this.assertEnabled();
    try {
      await this.prisma.simulatedWhatsappMessage.create({ data: text });
    } catch (error) {
      // Mesmo alerta de novo: a mensagem já foi entregue, nada a fazer.
      if (text.alertId && isUniqueViolation(error)) return;
      throw error;
    }
  }

  /** Mensagens simuladas, da mais nova para a mais antiga. */
  async list() {
    return this.prisma.simulatedWhatsappMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        phone: true,
        kind: true,
        body: true,
        createdAt: true,
      },
    });
  }
}
