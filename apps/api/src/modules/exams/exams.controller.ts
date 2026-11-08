import {
  type ClinicSettings,
  clinicSettingsSchema,
  type Exam,
  type ExamCatalog,
  type ExamCreateBody,
  type ExamList,
  type ExamUpdateBody,
  examCreateBodySchema,
  examUpdateBodySchema,
} from '@hackathon/contracts';
import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ZodBodyPipe } from '../../common/pipes/zod-body.pipe';
import { ClinicOnly, CurrentClinicId } from '../clinics/clinic.guard';
import { ExamsService } from './exams.service';

/** Exames, catálogo e configuração de preço da clínica da sessão (HACK-17). */
@ClinicOnly()
@Controller('clinic')
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get('exams')
  list(@CurrentClinicId() clinicId: string): Promise<ExamList> {
    return this.exams.list(clinicId);
  }

  @Post('exams')
  create(
    @CurrentClinicId() clinicId: string,
    @Body(new ZodBodyPipe(examCreateBodySchema)) body: ExamCreateBody,
  ): Promise<Exam> {
    return this.exams.create(clinicId, body);
  }

  @Put('exams/:id')
  update(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
    @Body(new ZodBodyPipe(examUpdateBodySchema)) body: ExamUpdateBody,
  ): Promise<Exam> {
    return this.exams.update(clinicId, id, body);
  }

  @Get('exam-catalog')
  catalog(): ExamCatalog {
    return this.exams.catalog();
  }

  @Get('settings')
  settings(@CurrentClinicId() clinicId: string): Promise<ClinicSettings> {
    return this.exams.settings(clinicId);
  }

  @Patch('settings')
  updateSettings(
    @CurrentClinicId() clinicId: string,
    @Body(new ZodBodyPipe(clinicSettingsSchema)) body: ClinicSettings,
  ): Promise<ClinicSettings> {
    return this.exams.updateSettings(clinicId, body);
  }
}
