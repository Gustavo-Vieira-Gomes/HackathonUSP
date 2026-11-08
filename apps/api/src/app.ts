import 'reflect-metadata';
import { type INestApplication, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { type AppEnv, loadEnv } from './config/env';

export interface CreateAppOptions {
  logger?: false;
  /** Configuração já validada; sem ela, lê e valida `process.env`. */
  env?: AppEnv;
}

export async function createApp(
  options: CreateAppOptions = {},
): Promise<INestApplication> {
  const env = options.env ?? loadEnv();
  return createAppFromModule(AppModule.register(env), options);
}

/**
 * Montagem única da aplicação (prefixo, body parser, shutdown), usada pelo boot e
 * pelos testes que precisam de um módulo raiz próprio.
 */
export async function createAppFromModule(
  module: Type | ReturnType<typeof AppModule.register>,
  options: Pick<CreateAppOptions, 'logger'> = {},
): Promise<INestApplication> {
  // O Better Auth lê o corpo cru das rotas /api/auth; a integração recoloca os
  // parsers nas demais rotas.
  const app = await NestFactory.create(module, {
    ...options,
    bodyParser: false,
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}

export function parsePort(value: string | undefined): number {
  const port = value === undefined ? 3001 : Number(value);
  if (!value?.trim() && value !== undefined) {
    throw new Error('PORT deve ser um inteiro entre 1 e 65535.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser um inteiro entre 1 e 65535.');
  }
  return port;
}
