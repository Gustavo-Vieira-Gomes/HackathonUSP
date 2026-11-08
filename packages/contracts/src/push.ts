import { z } from 'zod';

// Somente serviços de push dos navegadores: nunca aceitar destino HTTP arbitrário.
const endpointSchema = z
  .url()
  .max(2048)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname === 'web.push.apple.com' ||
        url.hostname.endsWith('.notify.windows.com'))
    );
  }, 'Serviço de push não suportado.');
const base64url = (length: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .length(length);
export const pushSubscriptionBodySchema = z.strictObject({
  endpoint: endpointSchema,
  expirationTime: z.number().nonnegative().nullable().optional(),
  keys: z.strictObject({ p256dh: base64url(87), auth: base64url(22) }),
});
export type PushSubscriptionBody = z.infer<typeof pushSubscriptionBodySchema>;
export const pushUnsubscribeBodySchema = z.strictObject({
  endpoint: endpointSchema,
});
export const pushKeyResponseSchema = z.strictObject({
  publicKey: z.string().nullable(),
});
export const pushRegistrationResponseSchema = z.strictObject({
  registered: z.boolean(),
});
