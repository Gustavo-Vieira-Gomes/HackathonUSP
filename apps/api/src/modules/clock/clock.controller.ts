import {
  type DemoClockResponse,
  demoClockAdvanceBodySchema,
} from '@hackathon/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { IncomingMessage as Request } from 'node:http';
import { AuthSessionService } from '../../auth/auth-session.service';
import { APP_ENV, type AppEnv } from '../../config/env';
import { ClockService } from './clock.service';

/**
 * Controle de tempo da demo (HACK-30), chamado pela tela do card 6.1. Só existe com
 * `DEMO_CLOCK_ENABLED=true`: fora disso responde 404, como uma rota que não existe.
 * Exige sessão de clínica, porque mover o relógio mexe no preço de todas as vagas.
 * `@AllowAnonymous` só tira o guard global da frente: a flag é conferida antes da
 * sessão, para a rota desligada responder 404 mesmo sem cookie.
 */
@AllowAnonymous()
@Controller('demo/clock')
export class ClockController {
  constructor(
    private readonly clock: ClockService,
    private readonly sessions: AuthSessionService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Get()
  async read(@Req() req: Request): Promise<DemoClockResponse> {
    await this.authorize(req);
    await this.clock.refresh();
    return this.snapshot();
  }

  @Post()
  @HttpCode(200)
  async advance(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<DemoClockResponse> {
    await this.authorize(req);
    const parsed = demoClockAdvanceBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_BODY',
        message:
          'Corpo inválido: envie apenas advanceMinutes, inteiro de 1 a 43200.',
      });
    }
    await this.clock.advance(parsed.data.advanceMinutes);
    return this.snapshot();
  }

  @Delete()
  async reset(@Req() req: Request): Promise<DemoClockResponse> {
    await this.authorize(req);
    await this.clock.reset();
    return this.snapshot();
  }

  private async authorize(req: Request): Promise<void> {
    if (!this.env.DEMO_CLOCK_ENABLED) throw new NotFoundException();
    const session = await this.sessions.getSession(req.headers);
    if (!session) throw new UnauthorizedException();
    if (session.user.role !== 'clinica') throw new ForbiddenException();
  }

  private snapshot(): DemoClockResponse {
    return {
      offsetMinutes: this.clock.offsetMinutes(),
      now: this.clock.now().toISOString(),
    };
  }
}
