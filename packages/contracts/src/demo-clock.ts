import { z } from 'zod';

/** Corpo de `POST /api/demo/clock`: quanto adiantar o relógio da demo (HACK-30). */
export const demoClockAdvanceBodySchema = z.strictObject({
  // Até 30 dias por chamada; o suficiente para atravessar todos os degraus.
  advanceMinutes: z
    .number()
    .int()
    .positive()
    .max(30 * 24 * 60),
});

export type DemoClockAdvanceBody = z.infer<typeof demoClockAdvanceBodySchema>;

/** Estado do relógio da demo, devolvido por GET, POST e DELETE. */
export const demoClockResponseSchema = z.strictObject({
  offsetMinutes: z.number().int().nonnegative(),
  /** Instante do negócio em ISO 8601 UTC, já com o deslocamento. */
  now: z.iso.datetime(),
});

export type DemoClockResponse = z.infer<typeof demoClockResponseSchema>;
