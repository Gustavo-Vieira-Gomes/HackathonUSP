import {
  type ReservaCriadaEvent,
  type VagaPrecoEvent,
  type VagaPublicadaEvent,
  type VagaReservadaEvent,
  realtimeEvents,
  reservaCriadaEventSchema,
  vagaPrecoEventSchema,
  vagaPublicadaEventSchema,
  vagaReservadaEventSchema,
} from '@hackathon/contracts';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RealtimeGateway } from './realtime.gateway';
import { salaDaClinica, salaDaVaga, salaDoPaciente } from './realtime.rooms';

const idSchema = z.string().min(1);
const idsSchema = z.array(idSchema);

/**
 * Único ponto de emissão dos eventos de tempo real. Os módulos emissores (motor,
 * ondas, pagamento) injetam este serviço e nunca o `Server` do socket.io. Cada
 * método valida o payload no schema de contrato e emite só na sala de destino;
 * payload inválido lança ao emissor sem emitir nada.
 */
@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  vagaPublicada(
    input: Omit<VagaPublicadaEvent, 'em'>,
    pacienteIds: string[],
  ): void {
    const payload = vagaPublicadaEventSchema.parse({ ...input, em: agora() });
    const ids = idsSchema.parse(pacienteIds);
    // Lista vazia não pode virar `to([])`, que no socket.io é broadcast para todos.
    if (ids.length === 0) return;
    this.gateway.server
      .to(ids.map(salaDoPaciente))
      .emit(realtimeEvents.vagaPublicada, payload);
  }

  vagaPreco(input: Omit<VagaPrecoEvent, 'em'>): void {
    const payload = vagaPrecoEventSchema.parse({ ...input, em: agora() });
    this.gateway.server
      .to(salaDaVaga(payload.vagaId))
      .emit(realtimeEvents.vagaPreco, payload);
  }

  vagaReservada(input: Omit<VagaReservadaEvent, 'em'>): void {
    const payload = vagaReservadaEventSchema.parse({ ...input, em: agora() });
    this.gateway.server
      .to(salaDaVaga(payload.vagaId))
      .emit(realtimeEvents.vagaReservada, payload);
  }

  reservaCriada(
    clinicaId: string,
    input: Omit<ReservaCriadaEvent, 'em'>,
  ): void {
    const id = idSchema.parse(clinicaId);
    const payload = reservaCriadaEventSchema.parse({ ...input, em: agora() });
    this.gateway.server
      .to(salaDaClinica(id))
      .emit(realtimeEvents.reservaCriada, payload);
  }
}

function agora(): string {
  return new Date().toISOString();
}
