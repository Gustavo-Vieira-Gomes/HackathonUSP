import {
  type SignUpResponse,
  patientSignUpBodySchema,
} from '@hackathon/contracts';
import {
  UnprocessableEntityException,
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
import { SIGN_UP_RATE_LIMIT, SignUpRequestGuard } from './sign-up-protection';
import { PatientSignUpService } from '../modules/patients/patient-sign-up.service';

/**
 * Cadastros separados por papel (D1): o papel vem da rota, nunca do corpo.
 * Origem e tipo (403/415) antes do limite de taxa (429), nessa ordem.
 * O de clínica (`POST /api/sign-up/clinica`, perfil completo) fica no
 * `ClinicSignUpController` do módulo de clínicas (HACK-16), com as mesmas proteções.
 */
@AllowAnonymous()
@UseGuards(SignUpRequestGuard, ThrottlerGuard)
@Throttle({ default: SIGN_UP_RATE_LIMIT })
@Controller('sign-up')
export class SignUpController {
  constructor(private readonly signUpService: PatientSignUpService) {}

  @Post('paciente')
  @HttpCode(200)
  signUpPaciente(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignUpResponse> {
    return this.handle(body, req, res);
  }

  private async handle(
    body: unknown,
    req: Request,
    res: Response,
  ): Promise<SignUpResponse> {
    if (
      typeof body !== 'object' ||
      body === null ||
      !('healthDataConsent' in body) ||
      body.healthDataConsent !== true
    ) {
      throw new UnprocessableEntityException({
        code: 'CONSENT_REQUIRED',
        message: 'consentimento obrigatório',
      });
    }
    const parsed = patientSignUpBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_BODY',
        message:
          'Corpo inválido: informe nome, e-mail, telefone, senha e consentimento.',
        fields: [
          ...new Set(
            parsed.error.issues.map((issue) => issue.path.join('.') || 'body'),
          ),
        ],
      });
    }
    const result = await this.signUpService.signUp(parsed.data, req.headers);
    res.setHeader('set-cookie', result.setCookie);
    return result.body;
  }
}
