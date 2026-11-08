import { z } from 'zod';

export const REQUIRED_ENV = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'WEB_ORIGIN',
] as const;

const filled = z.string().trim().min(1);

const envSchema = z.object({
  DATABASE_URL: filled,
  BETTER_AUTH_SECRET: filled.min(32),
  BETTER_AUTH_URL: filled.pipe(z.url()),
  WEB_ORIGIN: filled.pipe(z.url()),
  AUTH_PROXY_SECRET: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
  ),
});

export type AppEnv = z.infer<typeof envSchema>;

/** Token de injeção da configuração validada no boot. */
export const APP_ENV = Symbol('APP_ENV');

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError';
}

/**
 * Valida as variáveis obrigatórias. A mensagem cita só os nomes inválidos,
 * nunca valores, para não vazar segredo em log.
 */
export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): AppEnv {
  const picked = Object.fromEntries(
    REQUIRED_ENV.map((name) => [name, source[name]]),
  );
  const result = envSchema
    .superRefine((env, context) => {
      if (source.NODE_ENV === 'production' && !env.AUTH_PROXY_SECRET) {
        context.addIssue({
          code: 'custom',
          path: ['AUTH_PROXY_SECRET'],
          message: 'Obrigatório em produção.',
        });
      }
    })
    .safeParse({ ...picked, AUTH_PROXY_SECRET: source.AUTH_PROXY_SECRET });
  if (result.success) return result.data;
  const names = [
    ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
  ];
  throw new EnvValidationError(
    `Configuração inválida ou ausente: ${names.join(', ')}. ` +
      'Confira o .env (modelo em .env.example); BETTER_AUTH_SECRET exige 32 caracteres ou mais.',
  );
}
