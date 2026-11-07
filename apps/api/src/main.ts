import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createApp, parsePort } from './app';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) loadEnvFile('.env');
  const port = parsePort(process.env.PORT);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!host.trim()) throw new Error('HOST não pode ser vazio.');
  const app = await createApp();
  await app.listen(port, host);
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
