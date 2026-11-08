import {
  clinicVacancyCreateBodySchema,
  type ClinicVacancyCreateBody,
} from '@hackathon/contracts';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ZodBodyPipe } from '../../common/pipes/zod-body.pipe';
import { ClinicOnly, CurrentClinicId } from '../clinics/clinic.guard';
import { ClinicVacanciesService } from './clinic-vacancies.service';

@ClinicOnly()
@Controller('clinic')
export class ClinicVacanciesController {
  constructor(private readonly vacancies: ClinicVacanciesService) {}

  @Get('vacancies')
  list(@CurrentClinicId() clinicId: string) {
    return this.vacancies.list(clinicId);
  }

  @Post('vacancies')
  publish(
    @CurrentClinicId() clinicId: string,
    @Body(new ZodBodyPipe(clinicVacancyCreateBodySchema))
    body: ClinicVacancyCreateBody,
  ) {
    return this.vacancies.publish(clinicId, body);
  }

  @Post('reservations/:id/no-show')
  declareNoShow(@CurrentClinicId() clinicId: string, @Param('id') id: string) {
    return this.vacancies.declareNoShow(clinicId, id);
  }
}
