import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { APP_ENV, type AppEnv } from '../../../config/env';

/** Tempo máximo de cada tentativa; o canal de alerta ainda tem os 5 s dele. */
export const EMAIL_ATTEMPT_TIMEOUT_MS = 4_000;
/** Duas tentativas no total (HACK-36): envio é idempotente pela chave. */
export const EMAIL_MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 200;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailOptions {
  /** Mesma chave = mesmo e-mail no Resend, mesmo com retentativa ou reenvio. */
  idempotencyKey: string;
  /** Aborta as tentativas (por exemplo, o tempo limite do canal de alerta). */
  signal?: AbortSignal;
}

export class EmailDeliveryError extends Error {
  override readonly name = 'EmailDeliveryError';
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

const resendResponseSchema = z.object({ id: z.string().min(1) });

/**
 * E-mail transacional via Resend (HACK-36). A chave fica só no servidor e nunca vai
 * para o log. Repete uma vez só em erro de rede, 429 ou 5xx; 4xx de validação não
 * se repete. O header `Idempotency-Key` do Resend garante que a segunda tentativa,
 * ou o reenvio de um alerta pendente abandonado, não gera um segundo e-mail.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  isConfigured(): boolean {
    return Boolean(this.env.RESEND_API_KEY && this.env.EMAIL_FROM);
  }

  async send(
    message: EmailMessage,
    options: SendEmailOptions,
  ): Promise<{ id: string }> {
    const { RESEND_API_KEY: apiKey, EMAIL_FROM: from } = this.env;
    if (!apiKey || !from) {
      throw new EmailDeliveryError('e-mail não configurado', false);
    }
    let lastError: EmailDeliveryError | undefined;
    for (let attempt = 1; attempt <= EMAIL_MAX_ATTEMPTS; attempt++) {
      if (options.signal?.aborted) break;
      try {
        return await this.attempt(apiKey, from, message, options);
      } catch (error) {
        lastError =
          error instanceof EmailDeliveryError
            ? error
            : new EmailDeliveryError(describe(error), !options.signal?.aborted);
        this.logger.warn(
          `envio de e-mail falhou (tentativa ${attempt}/${EMAIL_MAX_ATTEMPTS}): ${lastError.message}`,
        );
        if (!lastError.retryable) break;
        if (attempt < EMAIL_MAX_ATTEMPTS) await delay(RETRY_DELAY_MS);
      }
    }
    throw lastError ?? new EmailDeliveryError('envio abortado', false);
  }

  private async attempt(
    apiKey: string,
    from: string,
    message: EmailMessage,
    options: SendEmailOptions,
  ): Promise<{ id: string }> {
    const signals = [AbortSignal.timeout(EMAIL_ATTEMPT_TIMEOUT_MS)];
    if (options.signal) signals.push(options.signal);
    const response = await fetch(new URL('/emails', this.env.RESEND_API_URL), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': options.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.any(signals),
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      // Só o status: o corpo do Resend pode ecoar o destinatário.
      throw new EmailDeliveryError(
        `Resend respondeu ${response.status}`,
        retryable,
      );
    }
    const parsed = resendResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new EmailDeliveryError('resposta do Resend sem id', false);
    }
    return parsed.data;
  }
}

function describe(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return `tempo esgotado (${EMAIL_ATTEMPT_TIMEOUT_MS} ms)`;
  }
  return error instanceof Error ? error.message : 'erro desconhecido';
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
