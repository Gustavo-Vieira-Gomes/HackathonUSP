import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaClient } from '../generated/prisma/client';

const CONNECTION_TIMEOUT_MS = 3000;

/**
 * Cliente Prisma do processo (AD-001). A conexão é preguiçosa: a API sobe e
 * responde à saúde mesmo com o banco fora do ar.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Verdadeiro quando o banco responde a uma consulta trivial. */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Traduz uma falha inesperada: banco inacessível vira 503; o resto segue
   * como erro interno. Só o nome do erro vai para o log, nunca a mensagem,
   * que pode conter argumentos da consulta.
   */
  async rethrowUnavailable(error: unknown): Promise<never> {
    if (!(await this.isReachable())) {
      this.logger.warn('Banco de dados inacessível.');
      throw new ServiceUnavailableException();
    }
    throw error;
  }
}
