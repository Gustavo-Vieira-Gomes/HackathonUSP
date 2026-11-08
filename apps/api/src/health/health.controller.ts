import {
  healthResponseSchema,
  type HealthResponse,
} from '@hackathon/contracts';
import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@AllowAnonymous()
@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return healthResponseSchema.parse({ status: 'ok', service: 'api' });
  }
}
