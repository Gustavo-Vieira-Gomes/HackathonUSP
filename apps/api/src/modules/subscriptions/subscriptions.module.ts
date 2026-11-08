import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { ClockModule } from '../clock/clock.module';
import { VacanciesModule } from '../vacancies/vacancies.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionExpiryJob } from './subscription-expiry.job';

@Module({
  imports: [
    PatientsModule,
    ClinicsModule,
    ClockModule,
    VacanciesModule,
    NotificationsModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionExpiryJob],
})
export class SubscriptionsModule {}
