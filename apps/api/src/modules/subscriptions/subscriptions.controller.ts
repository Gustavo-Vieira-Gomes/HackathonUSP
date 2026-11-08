import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  subscriptionCreateBodySchema,
  type SubscriptionCreateBody,
} from '@hackathon/contracts';
import { ZodBodyPipe } from '../../common/pipes/zod-body.pipe';
import { CurrentPatientId, PatientOnly } from '../patients/patient.guard';
import { SubscriptionsService } from './subscriptions.service';

@PatientOnly()
@Controller('patient/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  list(@CurrentPatientId() patientId: string) {
    return this.subscriptions.list(patientId);
  }

  @Post()
  create(
    @CurrentPatientId() patientId: string,
    @Body(new ZodBodyPipe(subscriptionCreateBodySchema))
    body: SubscriptionCreateBody,
  ) {
    return this.subscriptions.create(patientId, body);
  }

  @Post(':id/renew')
  renew(@CurrentPatientId() patientId: string, @Param('id') id: string) {
    return this.subscriptions.renew(patientId, id);
  }
}
