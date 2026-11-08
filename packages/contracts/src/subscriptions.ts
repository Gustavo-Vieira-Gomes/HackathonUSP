import { z } from 'zod';

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
export const subscriptionWindowSchema = z
  .strictObject({
    weekday: z.int().min(0).max(6),
    startMinute: z.int().min(0).max(1439),
    endMinute: z.int().min(1).max(1440),
  })
  .refine((window) => window.endMinute > window.startMinute, {
    message: 'O fim deve ser depois do início.',
    path: ['endMinute'],
  });

export const subscriptionCreateBodySchema = z
  .strictObject({
    tussCode: z.string().regex(/^\d{8}$/),
    address: z.string().trim().min(5).max(500).optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    radiusMeters: z.int().min(100).max(200_000),
    maxPriceCents: z.int().min(1).max(10_000_000),
    windows: z.array(subscriptionWindowSchema).min(1).max(28),
    canGoToday: z.boolean().default(false),
    currentLatitude: latitude.optional(),
    currentLongitude: longitude.optional(),
  })
  .superRefine((body, ctx) => {
    if (
      !body.address &&
      (body.latitude === undefined || body.longitude === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['address'],
        message: 'Informe endereço ou localização.',
      });
    }
    if ((body.latitude === undefined) !== (body.longitude === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'Informe as duas coordenadas.',
      });
    }
    if (
      body.canGoToday &&
      (body.currentLatitude === undefined ||
        body.currentLongitude === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['currentLatitude'],
        message: 'Posso ir hoje exige localização atual.',
      });
    }
  });
export type SubscriptionCreateBody = z.infer<
  typeof subscriptionCreateBodySchema
>;

export const subscriptionSchema = z.strictObject({
  id: z.uuid(),
  tussCode: z.string(),
  maxPriceCents: z.int(),
  latitude,
  longitude,
  radiusMeters: z.int(),
  canGoToday: z.boolean(),
  currentLatitude: latitude.nullable(),
  currentLongitude: longitude.nullable(),
  expiresAt: z.iso.datetime(),
  active: z.boolean(),
  windows: z.array(subscriptionWindowSchema),
  clinicCount: z.int().min(0),
  matchedVacancyId: z.uuid().nullable(),
});
export type SubscriptionListItem = z.infer<typeof subscriptionSchema>;
export const subscriptionListSchema = z.strictObject({
  subscriptions: z.array(subscriptionSchema),
});
export const subscriptionResultSchema = z.strictObject({
  subscription: subscriptionSchema,
  matchedVacancyId: z.uuid().nullable(),
});
