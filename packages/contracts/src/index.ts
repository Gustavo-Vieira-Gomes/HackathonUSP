import { z } from 'zod';
import { sessionUserSchema } from './session';

export * from './exam-questionnaires';
export * from './realtime';
export * from './demo-clock';
export * from './session';
export * from './clinic';
export * from './exams';
export * from './whatsapp';
export * from './google-calendar';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.enum(['web', 'api']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Dados de conta repassados ao Better Auth pelos cadastros de cada perfil.
 * O papel não vem do corpo: campo extra, inclusive `role`, é recusado. A clínica
 * se cadastra com `clinicSignUpBodySchema`; paciente usa `patientSignUpBodySchema`.
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

export * from './patient';
