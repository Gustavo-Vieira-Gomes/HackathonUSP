import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Janela e limite de tentativas de login por e-mail (porta 6 do plano F1). */
export const LOGIN_THROTTLE = { ttl: 60_000, limit: 5 } as const;

/**
 * Conta tentativas de login pelo e-mail normalizado: atrás do Next todas as
 * chamadas chegam com o mesmo IP, então o IP não identifica quem tenta.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    request: Record<string, unknown>,
  ): Promise<string> {
    const body = request.body;
    if (typeof body === 'object' && body !== null && 'email' in body) {
      const email = body.email;
      if (typeof email === 'string' && email.trim()) {
        return `login:${email.trim().toLowerCase()}`;
      }
    }
    return `login-ip:${typeof request.ip === 'string' ? request.ip : 'desconhecido'}`;
  }
}
