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

/** Requisição depois do guard global do Better Auth e do `PatientGuard`. */
export interface PatientRequest extends IncomingMessage {
  session?: { user?: { id?: string } } | null;
  patientId?: string;
}

/**
 * Paciente da sessão (HACK-23): o `Patient.id` cujo `userId` é o da sessão.
 * É a única fonte do id do paciente em rota de paciente; id em URL, query, header ou
 * corpo nunca é lido. Conta `paciente` sem perfil → 403 `PATIENT_PROFILE_MISSING`.
 */
@Injectable()
export class PatientGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PatientRequest>();
    const userId = request.session?.user?.id;
    if (!userId) throw new UnauthorizedException();
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!patient) {
      throw new ForbiddenException({
        code: 'PATIENT_PROFILE_MISSING',
        message: 'Esta conta de paciente não tem perfil cadastrado.',
      });
    }
    request.patientId = patient.id;
    return true;
  }
}

/**
 * Marca uma rota (ou controller) como de paciente: sessão obrigatória (guard global,
 * 401), papel `paciente` (403) e paciente da sessão resolvida (`PatientGuard`).
 * Toda consulta por id de recurso filtra pelo paciente da sessão e responde 404
 * quando o recurso é de outro paciente.
 */
export const PatientOnly = () =>
  applyDecorators(Roles(['paciente']), UseGuards(PatientGuard));

/** Id do paciente da sessão, posto na requisição pelo `PatientGuard`. */
export const CurrentPatientId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { patientId } = context.switchToHttp().getRequest<PatientRequest>();
    if (!patientId) {
      throw new Error('CurrentPatientId usado fora de rota @PatientOnly().');
    }
    return patientId;
  },
);
