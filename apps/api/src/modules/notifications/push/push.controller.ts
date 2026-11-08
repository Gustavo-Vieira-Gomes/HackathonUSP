import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import {
  pushSubscriptionBodySchema,
  pushUnsubscribeBodySchema,
  type PushSubscriptionBody,
} from '@hackathon/contracts';
import { ZodBodyPipe } from '../../../common/pipes/zod-body.pipe';
import { CurrentPatientId, PatientOnly } from '../../patients/patient.guard';
import { PushService } from './push.service';

@PatientOnly()
@Controller('patient/push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('key')
  key() {
    return { publicKey: this.push.publicKey() };
  }

  @Post('subscriptions')
  @HttpCode(200)
  async register(
    @CurrentPatientId() patientId: string,
    @Body(new ZodBodyPipe(pushSubscriptionBodySchema))
    body: PushSubscriptionBody,
  ) {
    await this.push.register(patientId, body);
    return { registered: true };
  }

  @Delete('subscriptions')
  @HttpCode(200)
  async unregister(
    @CurrentPatientId() patientId: string,
    @Body(new ZodBodyPipe(pushUnsubscribeBodySchema))
    body: { endpoint: string },
  ) {
    await this.push.unregister(patientId, body.endpoint);
    return { registered: false };
  }
}
