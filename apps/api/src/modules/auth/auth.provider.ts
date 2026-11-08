import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';

export const AUTH = Symbol('AUTH');

const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7;
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

/**
 * Instância do Better Auth (AD-002). Usada só pelo servidor: o handler
 * `/api/auth/*` da biblioteca não é montado. Hash de senha, criação,
 * expiração e revogação de sessão são da biblioteca.
 */
export function createAuth(config: AppConfig, prisma: PrismaService) {
  return betterAuth({
    appName: 'Hackathon USP',
    baseURL: config.authBaseUrl,
    secret: config.authSecret,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: SEVEN_DAYS_IN_SECONDS,
      updateAge: ONE_DAY_IN_SECONDS,
    },
    user: {
      additionalFields: {
        phone: { type: 'string', required: true, input: true },
        healthConsentVersion: { type: 'string', required: true, input: true },
        role: {
          type: 'string',
          required: false,
          input: false,
          defaultValue: 'patient',
        },
        healthConsentAcceptedAt: {
          type: 'date',
          required: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Papel e horário do consentimento vêm sempre do servidor (AC 2).
          before: async (user) => ({
            data: {
              ...user,
              role: 'patient',
              healthConsentAcceptedAt: new Date(),
            },
          }),
        },
      },
    },
    advanced: { useSecureCookies: config.production },
    // O handler não é montado; o limite de login fica no Nest (porta 6).
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    // O logger da biblioteca grava e-mail e erros com argumentos de consulta.
    logger: { disabled: true },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export const authProvider = {
  provide: AUTH,
  inject: [APP_CONFIG, PrismaService],
  useFactory: createAuth,
};
