import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type Patient,
  type PatientSignUp,
  patientSignUpInputSchema,
} from '@hackathon/contracts';
import type { ApiResponse } from '../../common/http';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentPatient, SessionGuard } from '../auth/session.guard';
import { PatientsService } from './patients.service';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  @HttpCode(201)
  async signUp(
    @Body(new ZodValidationPipe(patientSignUpInputSchema)) input: PatientSignUp,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<Patient> {
    const { patient, setCookies } = await this.patients.signUp(input);
    response.append('Set-Cookie', setCookies);
    return patient;
  }

  /** RN-12: só os dados do dono da sessão; não existe rota por id. */
  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentPatient() patient: Patient): Patient {
    return patient;
  }
}
