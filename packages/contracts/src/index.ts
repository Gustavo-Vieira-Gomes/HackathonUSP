import { z } from 'zod';

export * from './exam-questionnaires';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.enum(['web', 'api']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Papel da conta. Uma conta tem um papel só (D2); quem fixa é a rota de cadastro. */
export const userRoleSchema = z.enum(['paciente', 'clinica']);

export type UserRole = z.infer<typeof userRoleSchema>;

/** Usuário da sessão devolvido por `GET /api/me`. */
export const sessionUserSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  role: userRoleSchema,
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

/**
 * Corpo de `POST /api/sign-up/paciente` e `/api/sign-up/clinica`.
 * O papel não vem do corpo: campo extra, inclusive `role`, é recusado.
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

/** Cadastro de paciente exige contato e consentimento explícito (RN-11). */
export const patientSignUpBodySchema = signUpBodySchema.extend({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/),
  healthDataConsent: z.literal(true),
});
export type PatientSignUpBody = z.infer<typeof patientSignUpBodySchema>;

export const patientSubscriptionResponseSchema = z.strictObject({
  id: z.uuid(),
  tussCode: z.string(),
  maxPriceCents: z.number().int(),
  expiresAt: z.iso.datetime(),
});
export type PatientSubscriptionResponse = z.infer<
  typeof patientSubscriptionResponseSchema
>;
