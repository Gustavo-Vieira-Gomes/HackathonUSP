import { z } from 'zod';
import { sessionUserSchema } from './session';

/** Uma faixa de expediente: dia da semana (0 = domingo) e minutos do dia, hora de São Paulo. */
export const clinicOpeningHoursSchema = z
  .strictObject({
    weekday: z.int().min(0).max(6),
    startMinute: z.int().min(0).max(1439),
    endMinute: z.int().min(1).max(1440),
  })
  .refine((range) => range.startMinute < range.endMinute, {
    path: ['endMinute'],
    message: 'O fechamento deve ser depois da abertura.',
  });

export type ClinicOpeningHours = z.infer<typeof clinicOpeningHoursSchema>;

/** Faixas do mesmo dia não podem se sobrepor; encostadas (fim = início) são aceitas. */
const openingHoursSchema = z
  .array(clinicOpeningHoursSchema)
  .min(1)
  .max(14)
  .superRefine((ranges, ctx) => {
    ranges.forEach((range, index) => {
      const overlaps = ranges
        .slice(0, index)
        .some(
          (earlier) =>
            earlier.weekday === range.weekday &&
            earlier.startMinute < range.endMinute &&
            range.startMinute < earlier.endMinute,
        );
      if (overlaps) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'startMinute'],
          message: 'Faixa sobreposta a outra do mesmo dia.',
        });
      }
    });
  });

/**
 * Corpo de `POST /api/sign-up/clinica` (HACK-16): conta e perfil num passo.
 * `name` vira o nome da conta e o da clínica. Campo extra (`role`, `clinicId`,
 * `latitude`…) é recusado: a coordenada vem do geocodificador, não da clínica.
 */
export const clinicSignUpBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  address: z.string().trim().min(5).max(300),
  cnes: z.string().regex(/^\d{7}$/),
  technicalManager: z.string().trim().min(3).max(160),
  openingHours: openingHoursSchema,
});

export type ClinicSignUpBody = z.infer<typeof clinicSignUpBodySchema>;

export const clinicSignUpResponseSchema = z.strictObject({
  user: sessionUserSchema,
  clinic: z.strictObject({
    id: z.uuid(),
    latitude: z.number(),
    longitude: z.number(),
  }),
});

export type ClinicSignUpResponse = z.infer<typeof clinicSignUpResponseSchema>;

/** Resposta de `GET /api/clinic/me`: perfil da clínica da sessão. */
export const clinicProfileSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  cnes: z.string(),
  technicalManager: z.string(),
  openingHours: z.array(
    z.strictObject({
      weekday: z.int().min(0).max(6),
      startMinute: z.int(),
      endMinute: z.int(),
    }),
  ),
});

export type ClinicProfile = z.infer<typeof clinicProfileSchema>;

export const vacancyStateSchema = z.enum([
  'publicada',
  'alertando',
  'reservada',
  'realizada',
  'expirada',
  'cancelada',
]);

export const vacancyOriginSchema = z.enum(['cancelamento', 'no_show', 'vazio']);

/** Resposta de `GET /api/clinic/vacancies/:id`: só vaga da clínica da sessão. */
export const clinicVacancySchema = z.strictObject({
  id: z.uuid(),
  state: vacancyStateSchema,
  origin: vacancyOriginSchema,
  currentPriceCents: z.int(),
  slot: z.strictObject({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    examId: z.uuid(),
  }),
});

export type ClinicVacancy = z.infer<typeof clinicVacancySchema>;

/** Corpo de erro com campo (422 de validação ou de regra). */
export const fieldErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  fields: z.array(z.string()).optional(),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;
