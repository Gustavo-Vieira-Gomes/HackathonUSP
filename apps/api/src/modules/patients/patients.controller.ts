import { Controller, Get, Param } from '@nestjs/common';
import { CurrentPatientId, PatientOnly } from './patient.guard';
import { PatientsService } from './patients.service';

@PatientOnly()
@Controller('patient')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get('reservations/:id')
  reservation(@CurrentPatientId() patientId: string, @Param('id') id: string) {
    return this.patients.reservation(patientId, id);
  }

  @Get('subscriptions/:id')
  subscription(@CurrentPatientId() patientId: string, @Param('id') id: string) {
    return this.patients.subscription(patientId, id);
  }
}
