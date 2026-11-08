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
 * `WhatsappService` (simulado no piloto) e só o HMAC dele fica no banco, com o
 * segredo da aplicação como chave. Vale 10 min, aceita 5 tentativas e só pode ser
 * reenviado depois de 60 s.
 *
 * Tudo usa o relógio real, não o da demo: prazo de código é segurança, e adiantar
 * o relógio da demo não pode expirar nem liberar códigos.
 */
@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async sendCode(patientId: string): Promise<{ expiresAt: Date }> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { phone: true, phoneVerification: { select: { sentAt: true } } },
    });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
    const now = new Date();
    const lastSent = patient.phoneVerification?.sentAt;
    if (lastSent && now.getTime() - lastSent.getTime() < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil(
        (RESEND_COOLDOWN_MS - (now.getTime() - lastSent.getTime())) / 1000,
      );
      throw new HttpException(
        {
          code: 'RESEND_TOO_SOON',
          message: 'Aguarde antes de pedir outro código.',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Antes de gravar um código que ninguém vai receber.
    this.whatsapp.assertEnabled();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    const data = {
      phone: patient.phone,
      codeHash: this.hash(patientId, code),
      attempts: 0,
      expiresAt,
      sentAt: now,
    };
    await this.prisma.phoneVerification.upsert({
      where: { patientId },
      create: { patientId, ...data },
      update: data,
    });
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
    if (!pending) {
      throw new UnprocessableEntityException({
        code: 'NO_PENDING_CODE',
        message: 'Peça um código antes de confirmar.',
      });
    }
    const now = new Date();
    if (pending.expiresAt <= now || pending.phone !== pending.patient.phone) {
      await this.discard(patientId);
      throw new GoneException({
        code: 'CODE_EXPIRED',
        message: 'O código expirou. Peça um novo.',
      });
    }
    if (pending.attempts >= MAX_ATTEMPTS) {
      await this.discard(patientId);
      throw this.tooManyAttempts();
    }

    if (!this.matches(pending.codeHash, this.hash(patientId, code))) {
      // Incremento atômico: tentativas concorrentes não passam do limite.
      const counted = await this.prisma.phoneVerification.updateMany({
        where: { patientId, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      const after = await this.prisma.phoneVerification.findUnique({
        where: { patientId },
        select: { attempts: true },
      });
      const used = after?.attempts ?? MAX_ATTEMPTS;
      if (counted.count === 0 || used >= MAX_ATTEMPTS) {
        await this.discard(patientId);
        throw this.tooManyAttempts();
      }
      throw new UnprocessableEntityException({
        code: 'INVALID_CODE',
        message: 'Código incorreto.',
        attemptsLeft: MAX_ATTEMPTS - used,
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
    return createHmac('sha256', this.env.BETTER_AUTH_SECRET)
      .update(`phone-verification:${patientId}:${code}`)
      .digest('hex');
  }

  private matches(stored: string, candidate: string): boolean {
    const a = Buffer.from(stored, 'hex');
    const b = Buffer.from(candidate, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async discard(patientId: string): Promise<void> {
    await this.prisma.phoneVerification.deleteMany({ where: { patientId } });
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
