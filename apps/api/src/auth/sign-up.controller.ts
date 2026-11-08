import {
  type SignUpResponse,
  signUpBodySchema,
  type UserRole,
} from '@hackathon/contracts';
import {
  BadRequestException,
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
import { SignUpService } from './sign-up.service';

/**
 * Cadastros separados por papel (D1): o papel vem da rota, nunca do corpo.
 * Origem e tipo (403/415) antes do limite de taxa (429), nessa ordem.
 */
@AllowAnonymous()
@UseGuards(SignUpRequestGuard, ThrottlerGuard)
@Throttle({ default: SIGN_UP_RATE_LIMIT })
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
    const parsed = signUpBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_BODY',
        message:
          'Corpo inválido: envie apenas name, email e password (8 caracteres ou mais).',
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
