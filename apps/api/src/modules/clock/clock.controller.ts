import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage as Request } from 'node:http';
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
import { APP_ENV, type AppEnv } from '../../config/env';
import { ClockService } from './clock.service';

/** Header com o segredo do operador da demo. */
export const DEMO_CLOCK_TOKEN_HEADER = 'x-demo-clock-token';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Controle de tempo da demo (HACK-30), chamado pela tela do card 6.1. Só existe com
 * `DEMO_CLOCK_ENABLED=true`: fora disso responde 404, como uma rota que não existe.
 *
 * O relógio é global e o preço só desce, então adiantá-lo é irreversível para todas
 * as clínicas. Por isso a autorização é um segredo do operador (`DEMO_CLOCK_TOKEN`,
 * header `x-demo-clock-token`), não uma sessão: o cadastro de clínica é aberto e
 * qualquer um teria o papel (HACK-46). Uma lista de e-mails também não serviria,
 * porque o cadastro não confirma o e-mail. A tela do 6.1 envia o token pelo servidor
 * do Next, nunca pelo navegador.
 */
@AllowAnonymous()
@Controller('demo/clock')
export class ClockController {
  constructor(
    private readonly clock: ClockService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Get()
  async read(@Req() req: Request): Promise<DemoClockResponse> {
    this.authorize(req);
    await this.clock.refresh();
    return this.snapshot();
  }

  @Post()
  @HttpCode(200)
  async advance(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<DemoClockResponse> {
    this.authorize(req);
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
    this.authorize(req);
    await this.clock.reset();
    return this.snapshot();
  }

  /** 404 com a flag desligada; 401 sem token; 403 com token errado. */
  private authorize(req: Request): void {
    const expected = this.env.DEMO_CLOCK_TOKEN;
    if (!this.env.DEMO_CLOCK_ENABLED || !expected) {
      throw new NotFoundException();
    }
    const sent = req.headers[DEMO_CLOCK_TOKEN_HEADER];
    if (typeof sent !== 'string' || sent.length === 0) {
      throw new UnauthorizedException();
    }
    // Compara digests de mesmo tamanho em tempo constante.
    if (!timingSafeEqual(digest(sent), digest(expected))) {
      throw new ForbiddenException();
    }
  }

  private snapshot(): DemoClockResponse {
    return {
      offsetMinutes: this.clock.offsetMinutes(),
      now: this.clock.now().toISOString(),
    };
  }
}
