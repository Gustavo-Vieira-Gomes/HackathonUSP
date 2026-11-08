import type { IncomingMessage } from 'node:http';
import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../../prisma/prisma.service';

/** Requisição depois do guard global do Better Auth e do `ClinicGuard`. */
export interface ClinicRequest extends IncomingMessage {
  session?: { user?: { id?: string } } | null;
  clinicId?: string;
}

/**
 * Clínica da sessão (HACK-16, porta 4): o `Clinic.id` cujo `userId` é o da sessão.
 * É a única fonte do id da clínica em rota de clínica; id em URL, query, header ou
 * corpo nunca é lido. Conta `clinica` sem perfil → 403 `CLINIC_PROFILE_MISSING`.
 */
@Injectable()
export class ClinicGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ClinicRequest>();
    const userId = request.session?.user?.id;
    if (!userId) throw new UnauthorizedException();
    const clinic = await this.prisma.clinic.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!clinic) {
      throw new ForbiddenException({
        code: 'CLINIC_PROFILE_MISSING',
        message: 'Esta conta de clínica não tem perfil cadastrado.',
      });
    }
    request.clinicId = clinic.id;
    return true;
  }
}

/**
 * Marca uma rota (ou controller) como de clínica: sessão obrigatória (guard global,
 * 401), papel `clinica` (403) e clínica da sessão resolvida (`ClinicGuard`).
 * Toda consulta por id de recurso filtra pela clínica da sessão e responde 404
 * quando o recurso é de outra clínica.
 */
export const ClinicOnly = () =>
  applyDecorators(Roles(['clinica']), UseGuards(ClinicGuard));

/** Id da clínica da sessão, posto na requisição pelo `ClinicGuard`. */
export const CurrentClinicId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { clinicId } = context.switchToHttp().getRequest<ClinicRequest>();
    if (!clinicId) {
      throw new Error('CurrentClinicId usado fora de rota @ClinicOnly().');
    }
    return clinicId;
  },
);
