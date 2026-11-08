import { z } from 'zod';

export const REQUIRED_ENV = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'WEB_ORIGIN',
] as const;

/**
 * Google Agenda (HACK-18): opcionais em grupo. Nenhuma preenchida = integração
 * indisponível (503); parte preenchida ou chave inválida = boot recusado.
 */
export const GOOGLE_CALENDAR_ENV = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'GOOGLE_TOKEN_ENCRYPTION_KEY',
] as const;

/** Opcionais: ausentes valem o padrão do schema. */
export const OPTIONAL_ENV = [
  'DEMO_CLOCK_ENABLED',
  'DEMO_CLOCK_TOKEN',
  'GEOCODER_URL',
  'GEOCODER_USER_AGENT',
  'GEOCODER_MIN_INTERVAL_MS',
  'RESEND_API_KEY',
  'RESEND_API_URL',
  'EMAIL_FROM',
  'VACANCY_MOTOR_ENABLED',
  'WHATSAPP_MODE',
  ...GOOGLE_CALENDAR_ENV,
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
    // Liga o motor de vagas a cada minuto (HACK-32). Os testes desligam, para o cron
    // real não mexer no banco compartilhado no meio de outro arquivo de teste.
    VACANCY_MOTOR_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
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
    // Geocodificador do cadastro de clínica (HACK-16): Nominatim, sem chave.
    // Nominatim público só serve à demo; uso real troca a URL.
    GEOCODER_URL: z.preprocess(
      blankAsUndefined,
      filled.pipe(z.url()).default('https://nominatim.openstreetmap.org'),
    ),
    // Identificação genérica do app exigida pela política do Nominatim (sem e-mail).
    GEOCODER_USER_AGENT: z.preprocess(
      blankAsUndefined,
      filled.default('hackathon-usp-marketplace/0.1'),
    ),
    // Intervalo mínimo entre chamadas, por processo (política: 1 req/s).
    GEOCODER_MIN_INTERVAL_MS: z.preprocess(
      blankAsUndefined,
      z.string().regex(/^\d+$/).default('1000').transform(Number),
    ),
    GOOGLE_OAUTH_CLIENT_ID: z.preprocess(blankAsUndefined, filled.optional()),
    GOOGLE_OAUTH_CLIENT_SECRET: z.preprocess(
      blankAsUndefined,
      filled.optional(),
    ),
    // {WEB_ORIGIN}/api/google-calendar/callback, cadastrada no Google Cloud.
    GOOGLE_OAUTH_REDIRECT_URI: z.preprocess(
      blankAsUndefined,
      filled.pipe(z.url()).optional(),
    ),
    // Base64 de exatamente 32 bytes (AES-256-GCM dos tokens).
    GOOGLE_TOKEN_ENCRYPTION_KEY: z.preprocess(
      blankAsUndefined,
      filled.refine(isBase64Key32).optional(),
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
    const missing = GOOGLE_CALENDAR_ENV.filter((name) => !env[name]);
    if (missing.length > 0 && missing.length < GOOGLE_CALENDAR_ENV.length) {
      for (const name of missing) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: 'as quatro GOOGLE_* vêm juntas',
        });
      }
    }
  });

function isBase64Key32(value: string): boolean {
  return (
    /^[A-Za-z0-9+/]+={0,2}$/.test(value) &&
    value.length % 4 === 0 &&
    Buffer.from(value, 'base64').length === 32
  );
}

export type AppEnv = z.infer<typeof envSchema>;

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** 32 bytes decodificados de GOOGLE_TOKEN_ENCRYPTION_KEY. */
  encryptionKey: Buffer;
}

/** `null` = integração indisponível neste ambiente (nenhuma GOOGLE_* preenchida). */
export function googleCalendarConfig(env: AppEnv): GoogleCalendarConfig | null {
  const {
    GOOGLE_OAUTH_CLIENT_ID: clientId,
    GOOGLE_OAUTH_CLIENT_SECRET: clientSecret,
    GOOGLE_OAUTH_REDIRECT_URI: redirectUri,
    GOOGLE_TOKEN_ENCRYPTION_KEY: key,
  } = env;
  if (!clientId || !clientSecret || !redirectUri || !key) return null;
  return {
    clientId,
    clientSecret,
    redirectUri,
    encryptionKey: Buffer.from(key, 'base64'),
  };
}

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
      'Confira o .env (modelo em .env.example); BETTER_AUTH_SECRET e DEMO_CLOCK_TOKEN exigem 32 caracteres ou mais e não podem ser o valor de exemplo; DEMO_CLOCK_TOKEN é obrigatório com DEMO_CLOCK_ENABLED=true; EMAIL_FROM é obrigatório com RESEND_API_KEY; GEOCODER_URL é URL e GEOCODER_MIN_INTERVAL_MS é inteiro ≥ 0; as quatro GOOGLE_* vêm juntas ou nenhuma, e GOOGLE_TOKEN_ENCRYPTION_KEY é base64 de 32 bytes.',
  );
}
