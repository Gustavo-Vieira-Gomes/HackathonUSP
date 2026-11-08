import type { IncomingHttpHeaders } from 'node:http';
import type {
  ClinicSignUpBody,
  ClinicSignUpResponse,
} from '@hackathon/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { SignUpService } from '../../auth/sign-up.service';
import { fieldError } from '../../common/pipes/zod-body.pipe';
import { isUniqueViolation } from '../../prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { GeocodingService } from './geocoding.service';

export interface ClinicSignUpResult {
  body: ClinicSignUpResponse;
  setCookie: string[];
}

const cnesTaken = () =>
  fieldError('CNES_TAKEN', 'Este CNES já está cadastrado.', ['cnes']);

/**
 * Cadastro de clínica num passo (HACK-16, RN-01): conta, perfil, coordenada e
 * expediente, ou nada. Ordem: CNES livre → geocodificação → conta no Better Auth
 * → `Clinic` com expediente num único `create`. Se a escrita da clínica falha
 * depois de a conta existir (CNES gravado por outra requisição no meio), a conta é
 * apagada (cascade em `Session` e `Account`) e a resposta não leva cookie.
 */
@Injectable()
export class ClinicSignUpService {
  private readonly logger = new Logger(ClinicSignUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    private readonly signUps: SignUpService,
  ) {}

  async signUp(
    body: ClinicSignUpBody,
    headers: IncomingHttpHeaders,
  ): Promise<ClinicSignUpResult> {
    const taken = await this.prisma.clinic.findUnique({
      where: { cnes: body.cnes },
      select: { id: true },
    });
    if (taken) throw cnesTaken();

    const point = await this.geocoding.geocode(body.address);
    if (!point) {
      throw fieldError(
        'ADDRESS_NOT_FOUND',
        'Endereço não encontrado. Confira rua, número e cidade.',
        ['address'],
      );
    }

    const account = await this.signUps.signUp(
      'clinica',
      { name: body.name, email: body.email, password: body.password },
      headers,
    );
    const userId = account.body.user.id;

    try {
      const clinic = await this.prisma.clinic.create({
        data: {
          userId,
          name: body.name,
          address: body.address,
          latitude: point.latitude,
          longitude: point.longitude,
          cnes: body.cnes,
          technicalManager: body.technicalManager,
          openingHours: { create: body.openingHours },
        },
        select: { id: true, latitude: true, longitude: true },
      });
      return {
        body: { user: account.body.user, clinic },
        setCookie: account.setCookie,
      };
    } catch (error) {
      try {
        await this.prisma.user.delete({ where: { id: userId } });
      } catch {
        // A conta ficou sem perfil (o guard responde 403 CLINIC_PROFILE_MISSING).
        this.logger.error(
          `Compensação do cadastro de clínica falhou: User não removido userId=${userId}`,
        );
        throw error;
      }
      if (!isUniqueViolation(error)) throw error;
      this.logger.warn(
        `Cadastro de clínica desfeito: CNES_TAKEN userId=${userId}`,
      );
      throw cnesTaken();
    }
  }
}
