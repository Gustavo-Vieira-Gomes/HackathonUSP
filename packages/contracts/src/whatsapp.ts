import { z } from 'zod';

/** Mensagem do WhatsApp simulado, devolvida por `GET /api/demo/whatsapp/messages` (HACK-37). */
export const simulatedWhatsappMessageSchema = z.strictObject({
  id: z.string().min(1),
  /** Telefone de destino, como cadastrado pelo paciente. */
  phone: z.string().min(1),
  kind: z.enum(['alerta', 'codigo_verificacao']),
  body: z.string(),
  /** Instante do envio em ISO 8601 UTC. */
  sentAt: z.iso.datetime(),
});

export type SimulatedWhatsappMessage = z.infer<
  typeof simulatedWhatsappMessageSchema
>;

export const simulatedWhatsappMessagesResponseSchema = z.strictObject({
  /** Da mais nova para a mais antiga. */
  messages: z.array(simulatedWhatsappMessageSchema),
});

export type SimulatedWhatsappMessagesResponse = z.infer<
  typeof simulatedWhatsappMessagesResponseSchema
>;

/** Corpo de `POST /api/me/phone/verification/confirm`: o código recebido. */
export const phoneVerificationConfirmBodySchema = z.strictObject({
  code: z.string().regex(/^\d{6}$/),
});

export type PhoneVerificationConfirmBody = z.infer<
  typeof phoneVerificationConfirmBodySchema
>;

/** Resposta do envio do código: até quando ele vale. */
export const phoneVerificationSentResponseSchema = z.strictObject({
  expiresAt: z.iso.datetime(),
});

export type PhoneVerificationSentResponse = z.infer<
  typeof phoneVerificationSentResponseSchema
>;

/** Resposta da confirmação: telefone verificado. */
export const phoneVerifiedResponseSchema = z.strictObject({
  phoneVerifiedAt: z.iso.datetime(),
});

export type PhoneVerifiedResponse = z.infer<typeof phoneVerifiedResponseSchema>;
