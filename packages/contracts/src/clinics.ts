import { z } from 'zod';

export const clinicsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
});
export const clinicsResponseSchema = z.strictObject({
  clinics: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      address: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      demoCalendarTarget: z.boolean(),
      exams: z.array(
        z.strictObject({
          id: z.uuid(),
          tussCode: z.string(),
          name: z.string(),
          fullPriceCents: z.int().nonnegative(),
          floorPriceCents: z.int().nonnegative(),
        }),
      ),
    }),
  ),
});
export type ClinicsResponse = z.infer<typeof clinicsResponseSchema>;
