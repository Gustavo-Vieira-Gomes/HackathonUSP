import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { oneTimeToken } from 'better-auth/plugins';
import type { AppEnv } from '../config/env';
import type { PrismaClient } from '../generated/prisma/client';
import { signUpRoleContext } from './role-context';

export function createAuth(env: AppEnv, prisma: PrismaClient) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        // Sem defaultValue: com `input: false`, um default trocaria o papel em silêncio.
        role: { type: 'string', input: false, required: false },
      },
    },
    // Bloqueia só o roteador HTTP; `auth.api.*` continua disponível no servidor.
    disabledPaths: ['/sign-up/email', '/one-time-token/verify'],
    plugins: [
      oneTimeToken({ storeToken: 'hashed', disableSetSessionCookie: true }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const role = signUpRoleContext.getStore();
            if (!role) return false;
            return { data: { ...user, role } };
          },
        },
      },
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
