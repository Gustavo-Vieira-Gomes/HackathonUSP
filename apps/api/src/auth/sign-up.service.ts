import type { IncomingHttpHeaders } from 'node:http';
import type {
  SignUpBody,
  SignUpResponse,
  UserRole,
  PatientSignUpBody,
} from '@hackathon/contracts';
import {
  HttpException,
  Injectable,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { patientSignUpBodySchema } from '@hackathon/contracts';
import { isAPIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { createAuth } from './auth.config';
import { signUpRoleContext } from './role-context';

export interface SignUpResult {
  body: SignUpResponse;
  setCookie: string[];
}

@Injectable()
export class SignUpService {
  private readonly logger = new Logger(SignUpService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /** Cria a conta com o papel da rota e já abre a sessão (cookie no resultado). */
  async signUp(
    role: UserRole,
    body: SignUpBody | PatientSignUpBody,
    headers: IncomingHttpHeaders,
  ): Promise<SignUpResult> {
    try {
      const patient =
        role === 'paciente' ? patientSignUpBodySchema.parse(body) : null;
      // Conta, credencial, sessão e perfil são confirmados juntos. Falha não deixa conta órfã.
      const { headers: responseHeaders, response } =
        await this.prisma.$transaction(async (tx) => {
          const result = await signUpRoleContext.run(role, () =>
            createAuth(this.env, tx).api.signUpEmail({
              body: {
                name: body.name,
                email: body.email,
                password: body.password,
              },
              headers: fromNodeHeaders(headers),
              returnHeaders: true,
            }),
          );
          if (patient) {
            await tx.patient.create({
              data: {
                userId: result.response.user.id,
                phone: patient.phone,
                healthDataConsentAt: new Date(),
              },
            });
          }
          return result;
        });
      const { user } = response;
      return {
        body: {
          user: { id: user.id, name: user.name, email: user.email, role },
        },
        setCookie: responseHeaders.getSetCookie(),
      };
    } catch (error) {
      if (isAPIError(error)) {
        throw new HttpException(
          {
            code: error.body?.code,
            message: error.body?.message ?? error.message,
          },
          error.statusCode,
        );
      }
      // Erros do Prisma podem carregar argumentos com telefone/e-mail; não registrar o objeto.
      this.logger.error('Falha ao persistir cadastro; transação revertida.');
      throw new InternalServerErrorException('Não foi possível criar a conta.');
    }
  }
}
