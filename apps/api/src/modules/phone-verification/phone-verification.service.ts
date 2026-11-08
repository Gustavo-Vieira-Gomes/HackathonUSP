import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import {
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../notifications/whatsapp/whatsapp.service';

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_ATTEMPTS = 5;

/**
 * Verificação do telefone do paciente por código de 6 dígitos (HACK-37), para o
 * WhatsApp não mandar dado de saúde a um número errado. O código sai pelo
 * `WhatsappService` (simulado no piloto) e só o HMAC dele fica no banco, com uma
 * chave derivada do segredo da aplicação. Vale 10 min, aceita 5 tentativas e só
 * pode ser reenviado depois de 60 s; os dois limites são conferidos na própria
 * gravação, para pedidos simultâneos não furarem (HACK-49).
 *
 * Quando existir edição de telefone (HACK-23), ela precisa zerar `phoneVerifiedAt`:
 * este serviço invalida o código pendente se o telefone mudar, mas não um telefone
 * já verificado.
 *
 * Tudo usa o relógio real, não o da demo: prazo de código é segurança, e adiantar
 * o relógio da demo não pode expirar nem liberar códigos.
 */
@Injectable()
export class PhoneVerificationService {
  /** Chave própria, derivada do segredo da aplicação, só para estes códigos. */
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.key = createHmac('sha256', env.BETTER_AUTH_SECRET)
      .update('hackathon/phone-verification/v1')
      .digest();
  }

  async sendCode(patientId: string): Promise<{ expiresAt: Date }> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { phone: true },
    });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
    // Antes de gravar um código que ninguém vai receber.
    this.whatsapp.assertEnabled();

    const now = new Date();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    const data = {
      phone: patient.phone,
      codeHash: this.hash(patientId, code),
      attempts: 0,
      expiresAt,
      sentAt: now,
    };
    // O intervalo de 60 s é conferido na própria gravação: dois pedidos
    // simultâneos não geram dois códigos.
    const replaced = await this.prisma.phoneVerification.updateMany({
      where: {
        patientId,
        sentAt: { lt: new Date(now.getTime() - RESEND_COOLDOWN_MS) },
      },
      data,
    });
    if (replaced.count === 0) {
      try {
        await this.prisma.phoneVerification.create({
          data: { patientId, ...data },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        throw await this.resendTooSoon(patientId, now);
      }
    }
    await this.whatsapp.sendText({
      patientId,
      phone: patient.phone,
      kind: 'codigo_verificacao',
      body: `Seu código de verificação é ${code}. Ele vale por 10 minutos. Não compartilhe.`,
    });
    return { expiresAt };
  }

  async confirm(
    patientId: string,
    code: string,
  ): Promise<{ phoneVerifiedAt: Date }> {
    const pending = await this.prisma.phoneVerification.findUnique({
      where: { patientId },
      include: { patient: { select: { phone: true } } },
    });
    if (!pending) throw this.noPendingCode();
    const now = new Date();
    if (pending.expiresAt <= now || pending.phone !== pending.patient.phone) {
      await this.discard(patientId);
      throw new GoneException({
        code: 'CODE_EXPIRED',
        message: 'O código expirou. Peça um novo.',
      });
    }

    // Reserva a tentativa antes de comparar (HACK-49). O UPDATE condicional é
    // atômico e devolve o número desta tentativa: palpites simultâneos disputam as
    // mesmas 5 vagas, e o resto nem chega a ser comparado.
    const reserved = await this.prisma.$queryRaw<{ attempts: number }[]>`
      UPDATE "PhoneVerification"
      SET "attempts" = "attempts" + 1
      WHERE "patientId" = ${patientId}::uuid
        AND "codeHash" = ${pending.codeHash}
        AND "attempts" < ${MAX_ATTEMPTS}
        AND "expiresAt" > ${now}
      RETURNING "attempts"`;
    const attempt = reserved[0]?.attempts;
    if (attempt === undefined) {
      const current = await this.attemptsOf(patientId);
      if (current === null) throw this.noPendingCode();
      if (current >= MAX_ATTEMPTS) throw this.tooManyAttempts();
      // Outro código foi emitido no meio: este não vale mais.
      throw this.noPendingCode();
    }

    if (!this.matches(pending.codeHash, this.hash(patientId, code))) {
      // Esgotado, o código fica gravado com attempts = 5 até expirar ou ser
      // substituído: toda tentativa seguinte recebe 429, sem ser comparada.
      if (attempt >= MAX_ATTEMPTS) throw this.tooManyAttempts();
      throw new UnprocessableEntityException({
        code: 'INVALID_CODE',
        message: 'Código incorreto.',
        attemptsLeft: MAX_ATTEMPTS - attempt,
      });
    }

    const [patient] = await this.prisma.$transaction([
      this.prisma.patient.update({
        where: { id: patientId },
        data: { phoneVerifiedAt: now },
        select: { phoneVerifiedAt: true },
      }),
      this.prisma.phoneVerification.deleteMany({ where: { patientId } }),
    ]);
    return { phoneVerifiedAt: patient.phoneVerifiedAt ?? now };
  }

  private hash(patientId: string, code: string): string {
    return createHmac('sha256', this.key)
      .update(`${patientId}:${code}`)
      .digest('hex');
  }

  private matches(stored: string, candidate: string): boolean {
    const a = Buffer.from(stored, 'hex');
    const b = Buffer.from(candidate, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async attemptsOf(patientId: string): Promise<number | null> {
    const row = await this.prisma.phoneVerification.findUnique({
      where: { patientId },
      select: { attempts: true },
    });
    return row?.attempts ?? null;
  }

  private async discard(patientId: string): Promise<void> {
    await this.prisma.phoneVerification.deleteMany({ where: { patientId } });
  }

  private async resendTooSoon(
    patientId: string,
    now: Date,
  ): Promise<HttpException> {
    const row = await this.prisma.phoneVerification.findUnique({
      where: { patientId },
      select: { sentAt: true },
    });
    const elapsed = row ? now.getTime() - row.sentAt.getTime() : 0;
    return new HttpException(
      {
        code: 'RESEND_TOO_SOON',
        message: 'Aguarde antes de pedir outro código.',
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000),
        ),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private noPendingCode(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: 'NO_PENDING_CODE',
      message: 'Peça um código antes de confirmar.',
    });
  }

  private tooManyAttempts(): HttpException {
    return new HttpException(
      {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Muitas tentativas. Peça um novo código.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
