import { randomUUID } from 'node:crypto';
import type { UserRole } from '@hackathon/contracts';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../app';
import { AuthSessionService } from '../auth/auth-session.service';
import { type AppEnv, loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sobe a API numa porta efêmera contra o Postgres do worktree (DATABASE_URL do
 * .env da API). Os e-mails de cada arquivo levam um marcador e são apagados no fim.
 */
export interface TestApp {
  app: INestApplication;
  url: string;
  env: AppEnv;
  prisma: PrismaService;
  sessions: AuthSessionService;
  email(): string;
  close(): Promise<void>;
}

/** Overrides entram como variáveis de ambiente cruas, antes da validação. */
export async function startTestApp(
  overrides: Partial<Record<keyof AppEnv, string>> = {},
): Promise<TestApp> {
  const env = loadEnv({ ...process.env, ...overrides });
  const app = await createApp({ logger: false, env });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const prisma = app.get(PrismaService);
  const tag = randomUUID().slice(0, 8);
  const suffix = `.${tag}@teste.local`;
  return {
    app,
    url,
    env,
    prisma,
    sessions: app.get(AuthSessionService),
    email: () => `${randomUUID()}${suffix}`,
    close: async () => {
      await prisma.user.deleteMany({ where: { email: { endsWith: suffix } } });
      await app.close();
    },
  };
}

export function jsonRequest(
  t: TestApp,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${t.url}${path}`, {
    method,
    headers: {
      origin: t.env.WEB_ORIGIN,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function signUp(
  t: TestApp,
  role: UserRole,
  body: Record<string, unknown>,
): Promise<Response> {
  return jsonRequest(t, 'POST', `/api/sign-up/${role}`, body);
}

/** Cookie de sessão (`nome=valor`) a partir dos `set-cookie` da resposta. */
export function sessionCookie(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0] ?? '')
    .find((pair) => pair.includes('session_token='));
  if (!cookie)
    throw new Error(`Resposta ${response.status} sem cookie de sessão.`);
  return cookie;
}

export async function signUpWithCookie(
  t: TestApp,
  role: UserRole,
): Promise<{ email: string; password: string; cookie: string; id: string }> {
  const email = t.email();
  const password = 'senha-forte-1';
  const response = await signUp(t, role, {
    name: `Teste ${role}`,
    email,
    password,
  });
  if (response.status !== 200) {
    throw new Error(
      `Cadastro ${role} falhou: ${response.status} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { user: { id: string } };
  return { email, password, cookie: sessionCookie(response), id: body.user.id };
}
