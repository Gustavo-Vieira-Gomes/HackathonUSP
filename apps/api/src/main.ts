import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createApp, parsePort } from './app';
import { EnvValidationError, loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) loadEnvFile('.env');
  const env = loadEnv();
  const port = parsePort(process.env.PORT);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!host.trim()) throw new Error('HOST não pode ser vazio.');
  const app = await createApp({ env });
  await app.listen(port, host);
}

void bootstrap().catch((error: unknown) => {
  // Erro de configuração imprime só a mensagem (nomes das variáveis, nunca valores).
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exitCode = 1;
});
