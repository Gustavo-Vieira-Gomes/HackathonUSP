import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../config/env';

/** Header com o segredo do operador da demo. */
export const DEMO_OPERATOR_TOKEN_HEADER = 'x-demo-clock-token';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Rotas `/api/demo/*`: só existem com `DEMO_CLOCK_ENABLED=true` e só respondem a
 * quem tem o segredo do operador (`DEMO_CLOCK_TOKEN`, HACK-46). Sessão de clínica
 * não basta, porque o cadastro é aberto. Sem a flag, 404, como uma rota que não
 * existe; sem token, 401; token errado, 403. Usar junto de `@AllowAnonymous()`,
 * para a flag ser conferida antes da sessão.
 */
@Injectable()
export class DemoOperatorGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.env.DEMO_CLOCK_TOKEN;
    if (!this.env.DEMO_CLOCK_ENABLED || !expected) {
      throw new NotFoundException();
    }
    const req = context.switchToHttp().getRequest<IncomingMessage>();
    const sent = req.headers[DEMO_OPERATOR_TOKEN_HEADER];
    if (typeof sent !== 'string' || sent.length === 0) {
      throw new UnauthorizedException();
    }
    // Compara digests de mesmo tamanho em tempo constante.
    if (!timingSafeEqual(digest(sent), digest(expected))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
