import {
  type DemoClockResponse,
  demoClockAdvanceBodySchema,
} from '@hackathon/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { DemoOperatorGuard } from '../../common/guards/demo-operator.guard';
import { ClockService } from './clock.service';

/**
 * Controle de tempo da demo (HACK-30), chamado pela tela do card 6.1.
 *
 * O relógio é global e o preço só desce, então adiantá-lo é irreversível para todas
 * as clínicas. Por isso a autorização é o segredo do operador (`DemoOperatorGuard`),
 * não uma sessão: o cadastro de clínica é aberto e qualquer um teria o papel
 * (HACK-46). Uma lista de e-mails também não serviria, porque o cadastro não
 * confirma o e-mail. A tela do 6.1 envia o token pelo servidor do Next, nunca pelo
 * navegador.
 */
@AllowAnonymous()
@UseGuards(DemoOperatorGuard)
@Controller('demo/clock')
export class ClockController {
  constructor(private readonly clock: ClockService) {}

  @Get()
  async read(): Promise<DemoClockResponse> {
    await this.clock.refresh();
    return this.snapshot();
  }

  @Post()
  @HttpCode(200)
  async advance(@Body() body: unknown): Promise<DemoClockResponse> {
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
  async reset(): Promise<DemoClockResponse> {
    await this.clock.reset();
    return this.snapshot();
  }

  private snapshot(): DemoClockResponse {
    return {
      offsetMinutes: this.clock.offsetMinutes(),
      now: this.clock.now().toISOString(),
    };
  }
}
