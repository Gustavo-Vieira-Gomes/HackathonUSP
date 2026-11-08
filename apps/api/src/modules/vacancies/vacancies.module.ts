import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchingService } from './matching.service';
import { PricingService } from './pricing.service';
import { VacanciesService } from './vacancies.service';
import { VacancyMotorJob } from './vacancy-motor.job';
import { WavesService } from './waves.service';

/**
 * Dono único das mudanças de estado da vaga (HACK-29). Quem precisa mudar
 * `Vacancy.state` importa este módulo e injeta o `VacanciesService`; update direto
 * do estado fora daqui é recusado na revisão. O motor a cada minuto (preço,
 * expiração, ondas) também mora aqui (HACK-32).
 */
@Module({
  imports: [RealtimeModule, NotificationsModule],
  providers: [
    VacanciesService,
    MatchingService,
    PricingService,
    WavesService,
    VacancyMotorJob,
  ],
  exports: [VacanciesService, MatchingService, PricingService],
})
export class VacanciesModule {}
