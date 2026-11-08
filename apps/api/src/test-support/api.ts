import { CONSENT_TERM_VERSION } from '@hackathon/contracts';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { Pool } from 'pg';
import { createApp } from '../app';
import type { AppConfig } from '../config/app-config';

/** Postgres local de compose.yaml; recriado por scripts/prepare-test-db.mjs. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://hackathon:hackathon@127.0.0.1:5432/hackathon_test';

export const TEST_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';

export const SESSION_COOKIE = 'better-auth.session_token';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    databaseUrl: TEST_DATABASE_URL,
    authSecret: TEST_SECRET,
    authBaseUrl: 'http://127.0.0.1:3001',
    production: false,
    ...overrides,
  };
}

export interface RunningApi {
  app: INestApplication;
  url: string;
  close(): Promise<void>;
}

export async function startApi(
  options: { config?: AppConfig; logger?: false | LoggerService } = {},
): Promise<RunningApi> {
  const app = await createApp({
    logger: options.logger ?? false,
    config: options.config ?? testConfig(),
  });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  return {
    app,
    url: url.replace('[::1]', '127.0.0.1'),
    close: () => app.close(),
  };
}

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function resetDatabase(): Promise<void> {
  await pool.query(
    'TRUNCATE "session", "account", "verification", "user" CASCADE',
  );
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export async function countRows(): Promise<Record<string, number>> {
  const [row] = await query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM "user") AS "user",
            (SELECT count(*) FROM "account") AS "account",
            (SELECT count(*) FROM "session") AS "session"`,
  );
  return {
    user: Number(row?.user),
    account: Number(row?.account),
    session: Number(row?.session),
  };
}

export function validSignUp(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Maria Souza',
    email: 'maria@exemplo.com',
    phone: '(11) 98765-4321',
    password: 'senha-da-maria-123',
    healthDataConsent: true,
    consentTermVersion: CONSENT_TERM_VERSION,
    ...overrides,
  };
}

export interface ApiCall {
  status: number;
  body: unknown;
  text: string;
  headers: Headers;
  setCookies: string[];
}

export async function call(
  baseUrl: string,
  method: string,
  path: string,
  options: {
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiCall> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    status: response.status,
    body,
    text,
    headers: response.headers,
    setCookies: response.headers.getSetCookie(),
  };
}

/** `Set-Cookie` da sessão, ou `undefined`. */
export function sessionSetCookie(setCookies: string[]): string | undefined {
  return setCookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

/** Valor para o header `Cookie` a partir do `Set-Cookie` da sessão. */
export function cookieHeader(setCookies: string[]): string {
  const cookie = sessionSetCookie(setCookies);
  if (!cookie) throw new Error('Resposta sem cookie de sessão.');
  return cookie.split(';')[0] ?? '';
}

export async function signUp(
  baseUrl: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; cookie: string }> {
  const result = await call(baseUrl, 'POST', '/api/patients', {
    body: validSignUp(overrides),
  });
  if (result.status !== 201) {
    throw new Error(`Cadastro falhou: ${result.status} ${result.text}`);
  }
  const body = result.body as { id: string };
  return { id: body.id, cookie: cookieHeader(result.setCookies) };
}
