import { z } from 'zod';
import { sessionUserSchema } from './session';

export * from './exam-questionnaires';
export * from './realtime';
export * from './demo-clock';
export * from './session';
export * from './clinic';
export * from './whatsapp';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.enum(['web', 'api']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Corpo de `POST /api/sign-up/paciente` e dados de conta repassados ao Better Auth.
 * O papel não vem do corpo: campo extra, inclusive `role`, é recusado. A clínica
 * se cadastra com `clinicSignUpBodySchema` (perfil completo, HACK-16).
 */
export const signUpBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

export type SignUpBody = z.infer<typeof signUpBodySchema>;

export const signUpResponseSchema = z.strictObject({
  user: sessionUserSchema,
});

export type SignUpResponse = z.infer<typeof signUpResponseSchema>;
