import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Patient } from '@hackathon/contracts';
import { ApiException } from '../../common/api-errors';
import type { ApiRequest } from '../../common/http';
import { AuthService } from './auth.service';

/**
 * Identifica o paciente só pela sessão do cookie (AD-005). Nenhum id enviado
 * pelo cliente é considerado; sem sessão válida responde `401 unauthenticated`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const patient = await this.auth.findSessionPatient(request.headers.cookie);
    if (!patient) throw new ApiException('unauthenticated');
    request.patient = patient;
    return true;
  }
}

/** Paciente resolvido pelo `SessionGuard`. */
export const CurrentPatient = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Patient => {
    const patient = context.switchToHttp().getRequest<ApiRequest>().patient;
    if (!patient) throw new ApiException('unauthenticated');
    return patient;
  },
);
