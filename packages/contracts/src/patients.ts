import { z } from 'zod';

/** Versão vigente do termo de consentimento para dados de saúde (RN-11). */
export const CONSENT_TERM_VERSION = 'saude-v1';

const nameSchema = z.string().trim().min(2).max(120);

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Telefone brasileiro com DDD, 10 ou 11 dígitos após remover a máscara, em E.164. */
const phoneSchema = z
  .string()
  .max(40)
  .regex(/^[\d\s()+.-]+$/)
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().regex(/^[1-9]{2}(9\d{8}|[2-8]\d{7})$/))
  .transform((digits) => `+55${digits}`);

const passwordSchema = z.string().min(8).max(128);

/**
 * Formato do cadastro. O consentimento só tem o tipo validado aqui:
 * a decisão de recusar o cadastro sem consentimento é da API (RN-11).
 */
export const patientSignUpInputSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  healthDataConsent: z.boolean().optional(),
  consentTermVersion: z.string().max(40).optional(),
});

export const signInInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const patientSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
});

export type PatientSignUpInput = z.input<typeof patientSignUpInputSchema>;
export type PatientSignUp = z.output<typeof patientSignUpInputSchema>;
export type SignInInput = z.input<typeof signInInputSchema>;
export type SignIn = z.output<typeof signInInputSchema>;
export type Patient = z.infer<typeof patientSchema>;
