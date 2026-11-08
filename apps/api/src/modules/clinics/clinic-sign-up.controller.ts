import {
  type ClinicSignUpBody,
  type ClinicSignUpResponse,
  clinicSignUpBodySchema,
} from '@hackathon/contracts';
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type {
  IncomingMessage as Request,
  ServerResponse as Response,
} from 'node:http';
import {
  SIGN_UP_RATE_LIMIT,
  SignUpRequestGuard,
} from '../../auth/sign-up-protection';
import { ZodBodyPipe } from '../../common/pipes/zod-body.pipe';
import { ClinicSignUpService } from './clinic-sign-up.service';

/**
 * `POST /api/sign-up/clinica` (HACK-12, corpo do HACK-16): mesmas proteções do
 * cadastro de paciente - origem e JSON (403/415) antes do limite de taxa (429) -
 * e, só depois delas, a validação do corpo (422). Fica no módulo de clínicas para
 * o `AuthModule` não depender dele (o cadastro usa o `SignUpService` do auth).
 */
@AllowAnonymous()
@UseGuards(SignUpRequestGuard, ThrottlerGuard)
@Throttle({ default: SIGN_UP_RATE_LIMIT })
@Controller('sign-up')
export class ClinicSignUpController {
  constructor(private readonly clinicSignUp: ClinicSignUpService) {}

  @Post('clinica')
  @HttpCode(200)
  async signUpClinica(
    @Body(new ZodBodyPipe(clinicSignUpBodySchema)) body: ClinicSignUpBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClinicSignUpResponse> {
    const result = await this.clinicSignUp.signUp(body, req.headers);
    res.setHeader('set-cookie', result.setCookie);
    return result.body;
  }
}
