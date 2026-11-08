import type { ClinicProfile, ClinicVacancy } from '@hackathon/contracts';
import { Controller, Get, Param } from '@nestjs/common';
import { ClinicOnly, CurrentClinicId } from './clinic.guard';
import { ClinicsService } from './clinics.service';

@ClinicOnly()
@Controller('clinic')
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}

  @Get('me')
  me(@CurrentClinicId() clinicId: string): Promise<ClinicProfile> {
    return this.clinics.profile(clinicId);
  }

  /** Prova do isolamento (F2); o HACK-20 estende mantendo o 404. */
  @Get('vacancies/:id')
  vacancy(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
  ): Promise<ClinicVacancy> {
    return this.clinics.vacancy(clinicId, id);
  }
}
