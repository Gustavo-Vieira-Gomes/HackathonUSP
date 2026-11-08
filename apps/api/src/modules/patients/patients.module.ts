import { Module } from '@nestjs/common';
import { ClockModule } from '../clock/clock.module';
import { PatientGuard } from './patient.guard';
import { PatientRetentionJob } from './patient-retention.job';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [ClockModule],
  controllers: [PatientsController],
  providers: [PatientGuard, PatientsService, PatientRetentionJob],
  exports: [PatientGuard],
})
export class PatientsModule {}
