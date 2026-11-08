import type { SimulatedWhatsappMessagesResponse } from '@hackathon/contracts';
import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { DemoOperatorGuard } from '../../../common/guards/demo-operator.guard';
import { WhatsappService } from './whatsapp.service';

/**
 * Lista das mensagens do WhatsApp simulado para a tela `/demo/whatsapp` (HACK-37).
 * As mensagens têm dado de saúde (exame, preparo), então a rota exige o segredo do
 * operador da demo, como o relógio; sem o modo simulado, 404.
 */
@AllowAnonymous()
@UseGuards(DemoOperatorGuard)
@Controller('demo/whatsapp')
export class WhatsappDemoController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get('messages')
  async messages(): Promise<SimulatedWhatsappMessagesResponse> {
    if (!this.whatsapp.isEnabled()) throw new NotFoundException();
    const rows = await this.whatsapp.list();
    return {
      messages: rows.map((row) => ({
        id: row.id,
        phone: row.phone,
        kind: row.kind,
        body: row.body,
        sentAt: row.createdAt.toISOString(),
      })),
    };
  }
}
