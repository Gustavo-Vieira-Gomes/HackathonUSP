import type { IncomingHttpHeaders } from 'node:http';
import type {
  SignUpBody,
  SignUpResponse,
  UserRole,
} from '@hackathon/contracts';
import { userRoleSchema } from '@hackathon/contracts';
import { HttpException, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { isAPIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from './auth.config';
import { signUpRoleContext } from './role-context';

export interface SignUpResult {
  body: SignUpResponse;
  setCookie: string[];
}

@Injectable()
export class SignUpService {
  constructor(private readonly auth: AuthService<Auth>) {}

  /** Recuperação exige a senha da conta existente; nunca troca papel ou senha. */
  async signIn(
    body: SignUpBody,
    headers: IncomingHttpHeaders,
  ): Promise<SignUpResult> {
    const { headers: responseHeaders, response } =
      await this.auth.api.signInEmail({
        body: { email: body.email, password: body.password },
        headers: fromNodeHeaders(headers),
        returnHeaders: true,
      });
    const { user } = response;
    return {
      body: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: userRoleSchema.parse(user.role),
        },
      },
      setCookie: responseHeaders.getSetCookie(),
    };
  }

  /** Cria a conta com o papel da rota e já abre a sessão (cookie no resultado). */
  async signUp(
    role: UserRole,
    body: SignUpBody,
    headers: IncomingHttpHeaders,
  ): Promise<SignUpResult> {
    try {
      const { headers: responseHeaders, response } =
        await signUpRoleContext.run(role, () =>
          this.auth.api.signUpEmail({
            body,
            headers: fromNodeHeaders(headers),
            returnHeaders: true,
          }),
        );
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
      throw error;
    }
  }
}
