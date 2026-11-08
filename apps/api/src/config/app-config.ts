/** Configuração validada na inicialização (security.md: erro de configuração interrompe o boot). */
export interface AppConfig {
  databaseUrl: string;
  authSecret: string;
  authBaseUrl: string;
  production: boolean;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const MIN_SECRET_LENGTH = 32;

/** Lê e valida o ambiente. As mensagens nomeiam a variável, nunca o valor. */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL é obrigatória.');
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL deve ser uma URL postgresql://.');
  }

  const authSecret = env.BETTER_AUTH_SECRET;
  if (!authSecret?.trim()) {
    throw new Error('BETTER_AUTH_SECRET é obrigatória.');
  }
  if (authSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `BETTER_AUTH_SECRET deve ter pelo menos ${MIN_SECRET_LENGTH} caracteres.`,
    );
  }

  const authBaseUrl = env.BETTER_AUTH_URL?.trim() || 'http://127.0.0.1:3001';
  if (!URL.canParse(authBaseUrl)) {
    throw new Error('BETTER_AUTH_URL deve ser uma URL válida.');
  }

  return {
    databaseUrl,
    authSecret,
    authBaseUrl,
    production: env.NODE_ENV === 'production',
  };
}
