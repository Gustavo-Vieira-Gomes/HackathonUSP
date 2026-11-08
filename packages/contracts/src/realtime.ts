import { z } from 'zod';

/** Namespace socket.io dos eventos de tempo real (HACK-38). */
export const REALTIME_NAMESPACE = '/realtime';

/** Nomes literais dos eventos; cliente e servidor usam só estas constantes. */
export const realtimeEvents = {
  vagaPublicada: 'vaga.publicada',
  vagaPreco: 'vaga.preco',
  vagaReservada: 'vaga.reservada',
  reservaCriada: 'reserva.criada',
  vagaAssinar: 'vaga.assinar',
  vagaSair: 'vaga.sair',
} as const;

const vagaIdSchema = z.string().min(1).max(64);
/** Instante do aviso em ISO 8601 UTC. */
const emSchema = z.iso.datetime();

/**
 * Eventos servidor → sala. São avisos sem estado de verdade: a fonte continua
 * sendo a API HTTP. Payload magro, sem dado de quem reservou ou foi alertado.
 */
export const vagaPublicadaEventSchema = z.strictObject({
  vagaId: vagaIdSchema,
  em: emSchema,
});

/** Preço em centavos, inteiro: o mesmo valor em todas as telas (RN-27). */
export const vagaPrecoEventSchema = z.strictObject({
  vagaId: vagaIdSchema,
  precoCentavos: z.number().int().nonnegative(),
  em: emSchema,
});

export const vagaReservadaEventSchema = z.strictObject({
  vagaId: vagaIdSchema,
  em: emSchema,
});

export const reservaCriadaEventSchema = z.strictObject({
  reservaId: z.string().min(1).max(64),
  vagaId: vagaIdSchema,
  em: emSchema,
});

export type VagaPublicadaEvent = z.infer<typeof vagaPublicadaEventSchema>;
export type VagaPrecoEvent = z.infer<typeof vagaPrecoEventSchema>;
export type VagaReservadaEvent = z.infer<typeof vagaReservadaEventSchema>;
export type ReservaCriadaEvent = z.infer<typeof reservaCriadaEventSchema>;

/** Schema de cada evento servidor → cliente, pelo nome do evento. */
export const realtimeServerEventSchemas = {
  [realtimeEvents.vagaPublicada]: vagaPublicadaEventSchema,
  [realtimeEvents.vagaPreco]: vagaPrecoEventSchema,
  [realtimeEvents.vagaReservada]: vagaReservadaEventSchema,
  [realtimeEvents.reservaCriada]: reservaCriadaEventSchema,
} as const;

export type RealtimeServerEventName = keyof typeof realtimeServerEventSchemas;
export type RealtimeServerEventPayload<E extends RealtimeServerEventName> =
  z.infer<(typeof realtimeServerEventSchemas)[E]>;

/** Corpo de `vaga.assinar` e `vaga.sair` (cliente → servidor). */
export const vagaAssinaturaSchema = z.strictObject({ vagaId: vagaIdSchema });

export type VagaAssinatura = z.infer<typeof vagaAssinaturaSchema>;

export const realtimeAckSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    erro: z.enum(['payload_invalido', 'limite_assinaturas']),
  }),
]);

export type RealtimeAck = z.infer<typeof realtimeAckSchema>;
