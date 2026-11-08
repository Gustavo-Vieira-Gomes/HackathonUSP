import type { IncomingMessage } from 'node:http';
import {
  type GoogleCalendarConnection,
  type GoogleCalendarConnectResponse,
  type GoogleCalendarList,
  type GoogleCalendarSelectBody,
  googleCalendarSelectBodySchema,
} from '@hackathon/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Query,
  Redirect,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthSessionService } from '../../auth/auth-session.service';
import { ZodBodyPipe } from '../../common/pipes/zod-body.pipe';
import { APP_ENV, type AppEnv } from '../../config/env';
import { ClinicOnly, CurrentClinicId } from '../clinics/clinic.guard';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';

function single(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Rotas da clínica para a Google Agenda (HACK-18). Sessão e papel (401/403) vêm do
 * `@ClinicOnly()` antes do 503 de configuração; a clínica é sempre a da sessão.
 */
@ClinicOnly()
@Controller('clinic/google-calendar')
export class GoogleCalendarController {
  constructor(
    private readonly connections: GoogleCalendarConnectionService,
    private readonly sessions: AuthSessionService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Get()
  status(
    @CurrentClinicId() clinicId: string,
  ): Promise<GoogleCalendarConnection> {
    return this.connections.status(clinicId);
  }

  @Post('connect')
  @HttpCode(200)
  async connect(
    @CurrentClinicId() clinicId: string,
    @Req() req: IncomingMessage,
  ): Promise<GoogleCalendarConnectResponse> {
    return this.connections.startConnect(clinicId, await this.sessionId(req));
  }

  /** O Google volta pelo Next (mesma origem do cookie), que repassa para cá. */
  @Get('callback')
  @Redirect()
  async callback(
    @CurrentClinicId() clinicId: string,
    @Req() req: IncomingMessage,
    @Query() query: Record<string, unknown>,
  ): Promise<{ url: string; statusCode: number }> {
    const result = await this.connections.completeCallback(
      clinicId,
      await this.sessionId(req),
      {
        code: single(query.code),
        state: single(query.state),
        error: single(query.error),
      },
    );
    const url = new URL('/clinica/agenda', this.env.WEB_ORIGIN);
    url.searchParams.set('google', result);
    return { url: url.toString(), statusCode: 302 };
  }

  @Get('calendars')
  async calendars(
    @CurrentClinicId() clinicId: string,
  ): Promise<GoogleCalendarList> {
    return { calendars: await this.connections.listCalendars(clinicId) };
  }

  @Put('calendar')
  select(
    @CurrentClinicId() clinicId: string,
    @Body(new ZodBodyPipe(googleCalendarSelectBodySchema))
    body: GoogleCalendarSelectBody,
  ): Promise<GoogleCalendarConnection> {
    return this.connections.selectCalendar(clinicId, body.calendarId);
  }

  private async sessionId(req: IncomingMessage): Promise<string> {
    const session = await this.sessions.getSession(req.headers);
    if (!session) throw new UnauthorizedException();
    return session.session.id;
  }
}
