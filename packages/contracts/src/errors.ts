import { z } from 'zod';

export const apiErrorCodes = [
  'validation_failed',
  'invalid_credentials',
  'unauthenticated',
  'not_found',
  'email_in_use',
  'payload_too_large',
  'consent_required',
  'rate_limited',
  'internal_error',
  'service_unavailable',
] as const;

export const apiErrorCodeSchema = z.enum(apiErrorCodes);

/** Corpo de toda resposta de erro da API (AD-004). */
export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string().min(1),
  fields: z.array(z.string()).optional(),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
