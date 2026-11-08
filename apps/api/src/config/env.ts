import { z } from 'zod';

export const REQUIRED_ENV = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'WEB_ORIGIN',
] as const;

/** Opcionais: ausentes valem o padrão do schema. */
export const OPTIONAL_ENV = [
  'DEMO_CLOCK_ENABLED',
  'DEMO_CLOCK_TOKEN',
  'RESEND_API_KEY',
  'RESEND_API_URL',
  'EMAIL_FROM',
  'WHATSAPP_MODE',
] as const;

/** Vazio (como no .env.example) conta como ausente. */
const blankAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const filled = z.string().trim().min(1);

/** Placeholder antigo do .env.example e marcadores de valor de exemplo. */
const EXAMPLE_SECRET = /troque|change-?me/i;

const secret = filled.min(32).refine((value) => !EXAMPLE_SECRET.test(value));

const envSchema = z
  .object({
    DATABASE_URL: filled,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: filled.pipe(z.url()),
    WEB_ORIGIN: filled.pipe(z.url()),
    // Liga o endpoint que adianta o relógio da demo (HACK-30). Desligado por padrão.
    DEMO_CLOCK_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    // Segredo do operador da demo (HACK-46): só quem tem o token move o relógio global.
    DEMO_CLOCK_TOKEN: z.preprocess(blankAsUndefined, secret.optional()),
    // E-mail transacional via Resend (HACK-36). Sem a chave, o canal de e-mail não é
    // registrado e o Alert fica sem_canal, em vez de fingir que enviou.
    RESEND_API_KEY: z.preprocess(blankAsUndefined, filled.min(10).optional()),
    RESEND_API_URL: z.preprocess(
      blankAsUndefined,
      filled.pipe(z.url()).default('https://api.resend.com'),
    ),
    // Remetente verificado no Resend, por exemplo "Vagas <alertas@dominio.com.br>".
    EMAIL_FROM: z.preprocess(blankAsUndefined, filled.optional()),
    // WhatsApp no piloto (HACK-37): off não envia; simulated grava a mensagem para a
    // tela /demo/whatsapp. Integração real (Evolution/WAHA) fica fora do escopo.
    WHATSAPP_MODE: z.preprocess(
      blankAsUndefined,
      z.enum(['off', 'simulated']).default('off'),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.DEMO_CLOCK_ENABLED && !env.DEMO_CLOCK_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEMO_CLOCK_TOKEN'],
        message: 'obrigatório com DEMO_CLOCK_ENABLED=true',
      });
    }
    if (env.RESEND_API_KEY && !env.EMAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'obrigatório com RESEND_API_KEY',
      });
    }
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
      'Confira o .env (modelo em .env.example); BETTER_AUTH_SECRET e DEMO_CLOCK_TOKEN exigem 32 caracteres ou mais e não podem ser o valor de exemplo; DEMO_CLOCK_TOKEN é obrigatório com DEMO_CLOCK_ENABLED=true; EMAIL_FROM é obrigatório com RESEND_API_KEY.',
  );
}
