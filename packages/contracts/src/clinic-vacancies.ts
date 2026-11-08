import { z } from 'zod';

export const clinicVacancyCreateBodySchema = z
  .strictObject({
    examId: z.uuid(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: z.literal('vazio'),
  })
  .refine((body) => new Date(body.endsAt) > new Date(body.startsAt), {
    path: ['endsAt'],
    message: 'Fim deve ser posterior ao início.',
  });
export type ClinicVacancyCreateBody = z.infer<
  typeof clinicVacancyCreateBodySchema
>;

export const clinicVacanciesSchema = z.object({
  vacancies: z.array(
    z.object({
      id: z.uuid(),
      examName: z.string(),
      startsAt: z.iso.datetime(),
      state: z.enum([
        'publicada',
        'alertando',
        'reservada',
        'realizada',
        'expirada',
        'cancelada',
      ]),
      currentPriceCents: z.number().int().nonnegative(),
    }),
  ),
  reservations: z.array(
    z.object({
      id: z.uuid(),
      examName: z.string(),
      startsAt: z.iso.datetime(),
      state: z.enum([
        'aguardando_pagamento',
        'confirmada',
        'realizada',
        'no_show',
        'cancelada',
        'expirada',
      ]),
      canDeclareNoShow: z.boolean(),
    }),
  ),
  now: z.iso.datetime(),
});
export type ClinicVacancies = z.infer<typeof clinicVacanciesSchema>;
