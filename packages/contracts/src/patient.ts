import { z } from 'zod';

export const patientSignUpBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  phone: z.string().regex(/^\+?[1-9][0-9]{9,14}$/),
  healthDataConsent: z.literal(true),
});
export type PatientSignUpBody = z.infer<typeof patientSignUpBodySchema>;

export const patientReservationSchema = z.object({
  id: z.uuid(),
  state: z.enum([
    'aguardando_pagamento',
    'confirmada',
    'realizada',
    'no_show',
    'cancelada',
    'expirada',
  ]),
  type: z.enum(['comum', 'encaixe', 'no_show']),
  chargedPriceCents: z.int().nonnegative(),
  depositCents: z.int().nonnegative(),
  paymentMethod: z.enum(['pix', 'cartao', 'no_local']),
  slot: z.object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    exam: z.object({ name: z.string() }),
  }),
});
export type PatientReservation = z.infer<typeof patientReservationSchema>;

export const patientSubscriptionSchema = z.object({
  id: z.uuid(),
  tussCode: z.string(),
  maxPriceCents: z.int().nonnegative(),
  radiusMeters: z.int().nonnegative(),
  canGoToday: z.boolean(),
  expiresAt: z.iso.datetime(),
  windows: z.array(
    z.object({
      weekday: z.int().min(0).max(6),
      startMinute: z.int().min(0).max(1440),
      endMinute: z.int().min(0).max(1440),
    }),
  ),
});
export type PatientSubscription = z.infer<typeof patientSubscriptionSchema>;
