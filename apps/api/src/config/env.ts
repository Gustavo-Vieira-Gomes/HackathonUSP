import { z } from 'zod';

export const REQUIRED_ENV = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'WEB_ORIGIN',
] as const;

/** Opcionais: ausentes valem o padrão do schema. */
export const OPTIONAL_ENV = ['DEMO_CLOCK_ENABLED'] as const;

const filled = z.string().trim().min(1);

/** Placeholder antigo do .env.example e marcadores de valor de exemplo. */
const EXAMPLE_SECRET = /troque|change-?me/i;

const envSchema = z.object({
  DATABASE_URL: filled,
  BETTER_AUTH_SECRET: filled
    .min(32)
    .refine((secret) => !EXAMPLE_SECRET.test(secret)),
  BETTER_AUTH_URL: filled.pipe(z.url()),
  WEB_ORIGIN: filled.pipe(z.url()),
  // Liga o endpoint que adianta o relógio da demo (HACK-30). Desligado por padrão.
  DEMO_CLOCK_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
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
    [...REQUIRED_ENV, ...OPTIONAL_ENV].map((name) => [name, source[name]]),
  );
  const result = envSchema.safeParse(picked);
  if (result.success) return result.data;
  const names = [
    ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
  ];
  throw new EnvValidationError(
    `Configuração inválida ou ausente: ${names.join(', ')}. ` +
      'Confira o .env (modelo em .env.example); BETTER_AUTH_SECRET exige 32 caracteres ou mais e não pode ser o valor de exemplo.',
  );
}
