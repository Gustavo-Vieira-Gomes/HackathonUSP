import {
  type SignUpResponse,
  signUpBodySchema,
  patientSignUpBodySchema,
  type UserRole,
} from '@hackathon/contracts';
import {
  BadRequestException,
  UnprocessableEntityException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type {
  IncomingMessage as Request,
  ServerResponse as Response,
} from 'node:http';
import { SignUpService } from './sign-up.service';

/** Cadastros separados por papel (D1): o papel vem da rota, nunca do corpo. */
@AllowAnonymous()
@Controller('sign-up')
export class SignUpController {
  constructor(private readonly signUpService: SignUpService) {}

  @Post('paciente')
  @HttpCode(200)
  signUpPaciente(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignUpResponse> {
    return this.handle('paciente', body, req, res);
  }

  @Post('clinica')
  @HttpCode(200)
  signUpClinica(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignUpResponse> {
    return this.handle('clinica', body, req, res);
  }

  private async handle(
    role: UserRole,
    body: unknown,
    req: Request,
    res: Response,
  ): Promise<SignUpResponse> {
    if (
      role === 'paciente' &&
      (typeof body !== 'object' ||
        body === null ||
        !('healthDataConsent' in body) ||
        body.healthDataConsent !== true)
    ) {
      throw new UnprocessableEntityException('consentimento obrigatório');
    }
    const parsed = (
      role === 'paciente' ? patientSignUpBodySchema : signUpBodySchema
    ).safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_BODY',
        message:
          'Corpo inválido: confira nome, e-mail, senha (8 caracteres ou mais) e, para paciente, telefone e consentimento.',
        fields: [
          ...new Set(
            parsed.error.issues.map((issue) => issue.path.join('.') || 'body'),
          ),
        ],
      });
    }
    const result = await this.signUpService.signUp(
      role,
      parsed.data,
      req.headers,
    );
    res.setHeader('set-cookie', result.setCookie);
    return result.body;
  }
}
