import 'reflect-metadata';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function createApp(
  options: { logger?: false } = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, options);
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
