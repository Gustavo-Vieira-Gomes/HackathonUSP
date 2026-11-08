import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { VacanciesService } from './vacancies.service';

/**
 * Dono único das mudanças de estado da vaga (HACK-29). Quem precisa mudar
 * `Vacancy.state` importa este módulo e injeta o `VacanciesService`; update direto
 * do estado fora daqui é recusado na revisão.
 */
@Module({
  providers: [VacanciesService, MatchingService],
  exports: [VacanciesService, MatchingService],
})
export class VacanciesModule {}
