import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { ClockModule } from '../clock/clock.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VacanciesModule } from '../vacancies/vacancies.module';
import { CalendarSyncJob } from './calendar-sync.job';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleOAuthClient } from './google-oauth.client';

/**
 * Conexão da clínica com a Google Agenda (HACK-18). Exporta o
 * `GoogleCalendarConnectionService` (porta 3) para o sincronizador do HACK-19;
 * tabela e tokens não saem daqui.
 */
@Module({
  imports: [
    AuthModule,
    ClinicsModule,
    ClockModule,
    VacanciesModule,
    NotificationsModule,
  ],
  controllers: [GoogleCalendarController],
  providers: [
    GoogleOAuthClient,
    GoogleCalendarConnectionService,
    CalendarSyncJob,
  ],
  exports: [GoogleCalendarConnectionService],
})
export class GoogleCalendarModule {}
