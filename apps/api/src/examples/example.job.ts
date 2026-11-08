import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

export const EXAMPLE_JOB_NAME = 'example-heartbeat';

/** Exemplo de job a cada minuto. Será substituído pelos jobs reais (HACK-32). */
@Injectable()
export class ExampleJob {
  private readonly logger = new Logger(ExampleJob.name);

  @Cron('0 * * * * *', { name: EXAMPLE_JOB_NAME })
  run(): void {
    this.logger.log(`Job ${EXAMPLE_JOB_NAME} executado`);
  }
}
