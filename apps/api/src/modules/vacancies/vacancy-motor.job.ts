import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_ENV, type AppEnv } from '../../config/env';
import { ClockService } from '../clock/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingService } from './pricing.service';
import { VacanciesService } from './vacancies.service';
import { WavesService } from './waves.service';

export const VACANCY_MOTOR_JOB = 'vacancy-motor';

/** Etapa nomeada do tick; a ordem da lista é a ordem de execução. */
export type MotorStep = { name: string; run(now: Date): Promise<void> };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}

/**
 * Motor de vagas, a cada minuto (HACK-32): preço, expiração, cancelamento de
 * alertas pendentes de vaga fechada e ondas, nesta ordem, com o mesmo `now` do
 * relógio da demo. Cada etapa roda isolada: a que falha vai para o log e as
 * seguintes rodam. Um tick que ainda roda faz o disparo seguinte do mesmo processo
 * ser pulado; entre processos, a trava por vaga das ondas resolve.
 */
@Injectable()
export class VacancyMotorJob {
  private readonly logger = new Logger(VacancyMotorJob.name);
  private running = false;
  private readonly steps: MotorStep[];

  constructor(
    private readonly clock: ClockService,
    pricing: PricingService,
    vacancies: VacanciesService,
    notifications: NotificationsService,
    waves: WavesService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {
    this.steps = [
      {
        name: 'prices',
        run: async (now) => {
          await pricing.recalculatePrices(now);
        },
      },
      // HACK-27: a etapa das intenções de pagamento entra aqui, antes da expiração.
      {
        name: 'expire',
        run: async (now) => {
          await vacancies.expireDue(now);
        },
      },
      {
        name: 'cancel-pending',
        run: async () => {
          await notifications.cancelPendingOfClosedVacancies();
        },
      },
      { name: 'waves', run: (now) => waves.dispatchDue(now) },
    ];
  }

  @Cron('0 * * * * *', { name: VACANCY_MOTOR_JOB })
  async onCron(): Promise<void> {
    if (!this.env.VACANCY_MOTOR_ENABLED) return;
    if (this.running) {
      this.logger.warn(
        `${VACANCY_MOTOR_JOB}: tick anterior ainda roda, disparo pulado`,
      );
      return;
    }
    this.running = true;
    try {
      // O deslocamento da demo vive no banco: relê antes de cada ciclo (HACK-30).
      await this.clock.refresh();
      await this.tick(this.clock.now());
    } catch (error) {
      this.logger.error(`${VACANCY_MOTOR_JOB} falhou: ${errorMessage(error)}`);
    } finally {
      this.running = false;
    }
  }

  async tick(now: Date): Promise<void> {
    for (const step of this.steps) {
      try {
        await step.run(now);
      } catch (error) {
        this.logger.error(`etapa ${step.name} falhou: ${errorMessage(error)}`);
      }
    }
  }
}
