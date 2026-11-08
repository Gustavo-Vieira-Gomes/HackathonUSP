import 'reflect-metadata';
import { type INestApplication, type LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { type AppConfig, loadConfig } from './config/app-config';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

export async function createApp(
  options: { logger?: false | LoggerService; config?: AppConfig } = {},
): Promise<INestApplication> {
  const config = options.config ?? loadConfig(process.env);
  const app = await NestFactory.create(
    AppModule.register(config),
    options.logger === undefined ? {} : { logger: options.logger },
  );
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
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
