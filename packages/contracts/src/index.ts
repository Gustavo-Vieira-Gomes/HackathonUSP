import { z } from 'zod';

export * from './exam-questionnaires';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.enum(['web', 'api']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
