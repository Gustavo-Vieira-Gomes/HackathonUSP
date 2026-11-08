import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { clinicsQuerySchema } from '@hackathon/contracts';
import { ClinicsService } from './clinics.service';

@AllowAnonymous()
@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}
  @Get()
  search(@Query() query: unknown) {
    const parsed = clinicsQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(
        'Busca inválida: q deve ter até 120 caracteres.',
      );
    return this.clinics.search(parsed.data.q);
  }
}
