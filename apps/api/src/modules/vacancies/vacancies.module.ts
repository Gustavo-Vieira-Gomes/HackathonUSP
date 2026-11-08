import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchingService } from './matching.service';
import { PricingService } from './pricing.service';
import { VacanciesService } from './vacancies.service';

/**
 * Dono único das mudanças de estado da vaga (HACK-29). Quem precisa mudar
 * `Vacancy.state` importa este módulo e injeta o `VacanciesService`; update direto
 * do estado fora daqui é recusado na revisão.
 */
@Module({
  imports: [RealtimeModule],
  providers: [VacanciesService, MatchingService, PricingService],
  exports: [VacanciesService, MatchingService, PricingService],
})
export class VacanciesModule {}
