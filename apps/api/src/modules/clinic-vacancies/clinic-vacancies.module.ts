import { Module } from '@nestjs/common';
import { ClinicsModule } from '../clinics/clinics.module';
import { VacanciesModule } from '../vacancies/vacancies.module';
import { ClinicVacanciesController } from './clinic-vacancies.controller';
import { ClinicVacanciesService } from './clinic-vacancies.service';
import { NoShowMotorService } from './no-show-motor.service';

@Module({
  imports: [ClinicsModule, VacanciesModule],
  controllers: [ClinicVacanciesController],
  providers: [ClinicVacanciesService, NoShowMotorService],
  exports: [NoShowMotorService],
})
export class ClinicVacanciesModule {}
