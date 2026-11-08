import type { IncomingHttpHeaders } from 'node:http';
import { type SessionUser, userRoleSchema } from '@hackathon/contracts';
import { Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { isAPIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from './auth.config';

export interface AuthSession {
  user: SessionUser;
  session: { id: string; userId: string; expiresAt: Date };
}

interface RawSession {
  user: { id: string; name: string; email: string; role?: string | null };
  session: { id: string; userId: string; expiresAt: Date };
}

/**
 * Dono único da leitura de sessão: por cookie (`getSession`) e por token de uso
 * único (`verifyOneTimeToken`). Controllers e gateways injetam este serviço em vez
 * de chamar o Better Auth direto.
 */
@Injectable()
export class AuthSessionService {
  constructor(private readonly auth: AuthService<Auth>) {}

  async getSession(
    headers: IncomingHttpHeaders | Headers,
  ): Promise<AuthSession | null> {
    const raw = await this.auth.api.getSession({
      headers: headers instanceof Headers ? headers : fromNodeHeaders(headers),
    });
    return raw ? toAuthSession(raw) : null;
  }

  /** Consome o token: a segunda verificação do mesmo token devolve `null`. */
  async verifyOneTimeToken(token: string): Promise<AuthSession | null> {
    try {
      const raw = await this.auth.api.verifyOneTimeToken({ body: { token } });
      return toAuthSession(raw);
    } catch (error) {
      if (isAPIError(error)) return null;
      throw error;
    }
  }
}

function toAuthSession(raw: RawSession): AuthSession | null {
  const role = userRoleSchema.safeParse(raw.user.role);
  if (!role.success) return null;
  return {
    user: {
      id: raw.user.id,
      name: raw.user.name,
      email: raw.user.email,
      role: role.data,
    },
    session: {
      id: raw.session.id,
      userId: raw.session.userId,
      expiresAt: raw.session.expiresAt,
    },
  };
}
