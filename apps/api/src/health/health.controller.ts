import {
  healthResponseSchema,
  type HealthResponse,
} from '@hackathon/contracts';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return healthResponseSchema.parse({ status: 'ok', service: 'api' });
  }
}
