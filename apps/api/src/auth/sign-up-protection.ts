import type { IncomingMessage } from 'node:http';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../config/env';

/**
 * Limite das rotas de cadastro, por IP e por rota. Sem o IP real atrás do Next
 * (R2, HACK-14), todo cadastro pelo proxy cai no mesmo balde: 30/min não trava a
 * demo com várias pessoas e ainda corta automação.
 */
export const SIGN_UP_RATE_LIMIT = { limit: 30, ttl: 60_000 } as const;

/**
 * As rotas de cadastro chamam `auth.api.signUpEmail` fora do roteador do Better
 * Auth e perdem a checagem de origem e a restrição a JSON dele. Este guard as
 * repõe: origem diferente de WEB_ORIGIN (ou ausente) é 403, corpo que não é JSON
 * é 415. Roda antes do limite de taxa, para recusa barata não gastar a cota.
 */
@Injectable()
export class SignUpRequestGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.allowedOrigin = new URL(env.WEB_ORIGIN).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const { headers } = context.switchToHttp().getRequest<IncomingMessage>();
    if (headers.origin !== this.allowedOrigin) {
      throw new ForbiddenException({
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'Origem da requisição não permitida.',
      });
    }
    const mediaType = headers['content-type']
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== 'application/json') {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Envie o corpo como application/json.',
      });
    }
    return true;
  }
}
