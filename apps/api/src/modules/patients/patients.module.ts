import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { PatientRetentionJob } from './patient-retention.job';

@Module({
  imports: [AuthModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientRetentionJob],
})
export class PatientsModule {}
