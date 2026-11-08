import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleOAuthClient } from './google-oauth.client';

/**
 * Conexão da clínica com a Google Agenda (HACK-18). Exporta o
 * `GoogleCalendarConnectionService` (porta 3) para o sincronizador do HACK-19;
 * tabela e tokens não saem daqui.
 */
@Module({
  imports: [AuthModule, ClinicsModule],
  controllers: [GoogleCalendarController],
  providers: [GoogleOAuthClient, GoogleCalendarConnectionService],
  exports: [GoogleCalendarConnectionService],
})
export class GoogleCalendarModule {}
