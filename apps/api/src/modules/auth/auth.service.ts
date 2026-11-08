import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Patient, SignIn } from '@hackathon/contracts';
import { isAPIError } from 'better-auth/api';
import { ApiException } from '../../common/api-errors';
import { PrismaService } from '../../database/prisma.service';
import { AUTH, type Auth } from './auth.provider';

export interface AuthenticatedPatient {
  patient: Patient;
  /** Valores de `Set-Cookie` a repassar ao chamador (AD-003). */
  setCookies: string[];
}

export interface NewPatientAccount {
  name: string;
  email: string;
  phone: string;
  password: string;
  healthConsentVersion: string;
}

interface PatientUser {
  id: string;
  name: string;
  email: string;
  phone: string;
}

function toPatient(user: PatientUser): Patient {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone };
}

function errorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const body: unknown = error.body;
  if (typeof body === 'object' && body !== null && 'code' in body) {
    return typeof body.code === 'string' ? body.code : undefined;
  }
  return undefined;
}

/**
 * Adapter da biblioteca de autenticação (AD-002): chama `auth.api.*` e traduz
 * resultados e erros para o contrato da API. Não decide regra de negócio.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly prisma: PrismaService,
  ) {}

  async createAccount(
    account: NewPatientAccount,
  ): Promise<AuthenticatedPatient> {
    try {
      const { headers, response } = await this.auth.api.signUpEmail({
        body: account,
        returnHeaders: true,
      });
      return {
        patient: toPatient(response.user),
        setCookies: headers.getSetCookie(),
      };
    } catch (error) {
      const code = errorCode(error);
      if (code?.startsWith('USER_ALREADY_EXISTS')) {
        throw new ApiException('email_in_use');
      }
      // Corrida entre dois cadastros: o índice único recusa o segundo INSERT.
      if (
        code === 'FAILED_TO_CREATE_USER' &&
        (await this.emailExists(account.email))
      ) {
        throw new ApiException('email_in_use');
      }
      this.logger.error(`Falha ao criar conta: ${code ?? errorName(error)}.`);
      return this.prisma.rethrowUnavailable(error);
    }
  }

  async signIn(credentials: SignIn): Promise<AuthenticatedPatient> {
    try {
      const { headers, response } = await this.auth.api.signInEmail({
        body: credentials,
        returnHeaders: true,
      });
      return {
        patient: toPatient(response.user),
        setCookies: headers.getSetCookie(),
      };
    } catch (error) {
      if (isAPIError(error) && error.statusCode === 401) {
        throw new ApiException('invalid_credentials');
      }
      this.logger.error(
        `Falha no login: ${errorCode(error) ?? errorName(error)}.`,
      );
      return this.prisma.rethrowUnavailable(error);
    }
  }

  /** Paciente dono da sessão do cookie, ou `null` quando não há sessão válida. */
  async findSessionPatient(
    cookieHeader: string | undefined,
  ): Promise<Patient | null> {
    if (!cookieHeader) return null;
    try {
      const result = await this.auth.api.getSession({
        headers: new Headers({ cookie: cookieHeader }),
        query: { disableCookieCache: true, disableRefresh: false },
      });
      if (result) return toPatient(result.user);
      // A biblioteca devolve `null` também quando a consulta falha: sem esta
      // conferência, banco fora do ar viraria 401 em vez de 503.
      if (!(await this.prisma.isReachable())) {
        return this.prisma.rethrowUnavailable(new Error('Banco inacessível.'));
      }
      return null;
    } catch (error) {
      if (isAPIError(error) && error.statusCode < 500) return null;
      return this.prisma.rethrowUnavailable(error);
    }
  }

  /** Revoga a sessão do cookie, se houver, e devolve o cookie expirado. */
  async signOut(cookieHeader: string | undefined): Promise<string[]> {
    if (cookieHeader) {
      try {
        await this.auth.api.signOut({
          headers: new Headers({ cookie: cookieHeader }),
        });
      } catch (error) {
        if (!isAPIError(error)) await this.prisma.rethrowUnavailable(error);
      }
    }
    const context = await this.auth.$context;
    const { name, attributes } = context.authCookies.sessionToken;
    const secure = attributes.secure ? '; Secure' : '';
    return [`${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`];
  }

  private async emailExists(email: string): Promise<boolean> {
    try {
      return (await this.prisma.user.count({ where: { email } })) > 0;
    } catch {
      return false;
    }
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'erro desconhecido';
}
