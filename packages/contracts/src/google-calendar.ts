import { z } from 'zod';

/**
 * Conexão da clínica com a Google Agenda (HACK-18). `expired` cobre expirado e
 * revogado: o Google devolve o mesmo `invalid_grant` nos dois casos.
 */
export const googleCalendarStatusSchema = z.enum([
  'disconnected',
  'awaiting_calendar',
  'connected',
  'expired',
]);

export type GoogleCalendarStatus = z.infer<typeof googleCalendarStatusSchema>;

/** `GET /api/clinic/google-calendar` e resposta do `PUT .../calendar`. Nunca traz token. */
export const googleCalendarConnectionSchema = z.strictObject({
  status: googleCalendarStatusSchema,
  calendarName: z.string().optional(),
  connectedAt: z.iso.datetime().optional(),
});

export type GoogleCalendarConnection = z.infer<
  typeof googleCalendarConnectionSchema
>;

/** `POST /api/clinic/google-calendar/connect`. */
export const googleCalendarConnectResponseSchema = z.strictObject({
  authorizationUrl: z.url({ protocol: /^https$/ }),
});

export type GoogleCalendarConnectResponse = z.infer<
  typeof googleCalendarConnectResponseSchema
>;

/** Agenda em que a conta Google é dona (`accessRole` `owner`). */
export const googleCalendarItemSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  primary: z.boolean(),
});

export type GoogleCalendarItem = z.infer<typeof googleCalendarItemSchema>;

/** `GET /api/clinic/google-calendar/calendars`: primária primeiro, depois a ordem do Google. */
export const googleCalendarListSchema = z.strictObject({
  calendars: z.array(googleCalendarItemSchema),
});

export type GoogleCalendarList = z.infer<typeof googleCalendarListSchema>;

/** Corpo de `PUT /api/clinic/google-calendar/calendar`. */
export const googleCalendarSelectBodySchema = z.strictObject({
  calendarId: z.string().min(1).max(1024),
});

export type GoogleCalendarSelectBody = z.infer<
  typeof googleCalendarSelectBodySchema
>;

/** Resultado do callback OAuth, devolvido em `/clinica/agenda?google=<resultado>`. */
export const googleCalendarCallbackResultSchema = z.enum([
  'awaiting_calendar',
  'denied',
  'invalid_state',
  'no_refresh_token',
  'google_unavailable',
]);

export type GoogleCalendarCallbackResult = z.infer<
  typeof googleCalendarCallbackResultSchema
>;
