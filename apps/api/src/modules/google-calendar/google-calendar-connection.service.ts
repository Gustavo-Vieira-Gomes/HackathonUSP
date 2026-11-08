import { createHash, randomBytes } from 'node:crypto';
import type {
  GoogleCalendarCallbackResult,
  GoogleCalendarConnection,
  GoogleCalendarItem,
} from '@hackathon/contracts';
import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { fieldError } from '../../common/pipes/zod-body.pipe';
import {
  APP_ENV,
  type AppEnv,
  type GoogleCalendarConfig,
  googleCalendarConfig,
} from '../../config/env';
import type { CalendarConnection } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GoogleApiError,
  type GoogleCalendarApi,
  type GoogleCredentials,
  GoogleOAuthClient,
  type RefreshedTokens,
  translateGoogleError,
} from './google-oauth.client';
import { decryptToken, encryptToken } from './token-cipher';

export { isCredentialsRejectedError } from './google-oauth.client';

/** Validade do state OAuth, em relógio real (o Google não conhece o relógio da demo). */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** `getAuthorizedCalendar` de clínica cuja conexão não está `CONNECTED`. */
export class CalendarNotConnectedError extends Error {
  override readonly name = 'CalendarNotConnectedError';
  constructor() {
    super('A clínica não tem Google Agenda conectada.');
  }
}

const STATUS_OUT = {
  DISCONNECTED: 'disconnected',
  AWAITING_CALENDAR: 'awaiting_calendar',
  CONNECTED: 'connected',
  EXPIRED: 'expired',
} as const;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function notAuthorized(): ConflictException {
  return new ConflictException({
    code: 'CALENDAR_NOT_AUTHORIZED',
    message: 'A Google Agenda não está autorizada. Conecte de novo.',
  });
}

export interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

/**
 * Dono da conexão da clínica com a Google Agenda (HACK-18): state OAuth, tokens
 * cifrados, escolha da agenda e a API que o sincronizador (HACK-19) consome
 * (porta 3). O token só existe decifrado aqui dentro, ao montar o cliente.
 */
@Injectable()
export class GoogleCalendarConnectionService {
  private readonly logger = new Logger(GoogleCalendarConnectionService.name);
  private readonly config: GoogleCalendarConfig | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleOAuthClient,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.config = googleCalendarConfig(env);
  }

  /** 503 quando nenhuma GOOGLE_* está configurada. */
  assertAvailable(): GoogleCalendarConfig {
    if (!this.config) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_CALENDAR_UNAVAILABLE',
        message: 'Integração com a Google Agenda indisponível neste ambiente.',
      });
    }
    return this.config;
  }

  async status(clinicId: string): Promise<GoogleCalendarConnection> {
    this.assertAvailable();
    const row = await this.prisma.calendarConnection.findUnique({
      where: { clinicId },
    });
    return toConnection(row);
  }

  async startConnect(
    clinicId: string,
    sessionId: string,
  ): Promise<{ authorizationUrl: string }> {
    this.assertAvailable();
    const state = randomBytes(32).toString('base64url');
    const pending = {
      oauthStateHash: sha256(state),
      oauthStateSessionId: sessionId,
      oauthStateExpiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    };
    await this.prisma.calendarConnection.upsert({
      where: { clinicId },
      create: { clinicId, ...pending },
      update: pending,
    });
    return { authorizationUrl: this.google.buildAuthUrl(state) };
  }

  /** Nunca lança por falha do Google: o resultado vira `?google=` na tela. */
  async completeCallback(
    clinicId: string,
    sessionId: string,
    query: CallbackQuery,
  ): Promise<GoogleCalendarCallbackResult> {
    const { encryptionKey } = this.assertAvailable();
    if (!query.state) return 'invalid_state';
    // Consome o state numa escrita condicional: dois callbacks com o mesmo state,
    // só um zera a linha; o outro vê 0 linhas.
    const consumed = await this.prisma.calendarConnection.updateMany({
      where: {
        clinicId,
        oauthStateHash: sha256(query.state),
        oauthStateSessionId: sessionId,
        oauthStateExpiresAt: { gt: new Date() },
      },
      data: {
        oauthStateHash: null,
        oauthStateSessionId: null,
        oauthStateExpiresAt: null,
      },
    });
    if (consumed.count !== 1) return 'invalid_state';
    if (query.error) {
      return query.error === 'access_denied' ? 'denied' : 'google_unavailable';
    }
    if (!query.code) return 'google_unavailable';

    let tokens;
    try {
      tokens = await this.google.exchangeCode(query.code);
    } catch (error) {
      this.logFailure('troca do code', error);
      return 'google_unavailable';
    }
    if (!tokens.refreshToken) return 'no_refresh_token';
    await this.prisma.calendarConnection.update({
      where: { clinicId },
      data: {
        status: 'AWAITING_CALENDAR',
        refreshToken: encryptToken(
          encryptionKey,
          clinicId,
          tokens.refreshToken,
        ),
        accessToken: tokens.accessToken
          ? encryptToken(encryptionKey, clinicId, tokens.accessToken)
          : null,
        accessTokenExpiresAt: tokens.expiryDate
          ? new Date(tokens.expiryDate)
          : null,
        calendarId: null,
        calendarName: null,
        connectedAt: null,
      },
    });
    return 'awaiting_calendar';
  }

  /** Só agendas em que a conta é dona; primária primeiro, depois a ordem do Google. */
  async listCalendars(clinicId: string): Promise<GoogleCalendarItem[]> {
    const { encryptionKey } = this.assertAvailable();
    const row = await this.prisma.calendarConnection.findUnique({
      where: { clinicId },
    });
    if (
      !row?.refreshToken ||
      (row.status !== 'AWAITING_CALENDAR' && row.status !== 'CONNECTED')
    ) {
      throw notAuthorized();
    }
    let candidates;
    try {
      candidates = await this.google.listOwnedCalendars(
        this.credentials(encryptionKey, row),
      );
    } catch (error) {
      throw await this.googleFailure(clinicId, 'listagem de agendas', error);
    }
    const owned = candidates
      .filter((item) => item.accessRole === 'owner')
      .map(({ id, name, primary }) => ({ id, name, primary }));
    return [
      ...owned.filter((item) => item.primary),
      ...owned.filter((item) => !item.primary),
    ];
  }

  async selectCalendar(
    clinicId: string,
    calendarId: string,
  ): Promise<GoogleCalendarConnection> {
    const calendars = await this.listCalendars(clinicId);
    const chosen = calendars.find((item) => item.id === calendarId);
    if (!chosen) {
      throw fieldError(
        'CALENDAR_NOT_AVAILABLE',
        'Esta agenda não está entre as agendas próprias da conta Google.',
        ['calendarId'],
      );
    }
    const updated = await this.prisma.calendarConnection.updateMany({
      where: {
        clinicId,
        status: { in: ['AWAITING_CALENDAR', 'CONNECTED'] },
        refreshToken: { not: null },
      },
      data: {
        status: 'CONNECTED',
        calendarId: chosen.id,
        calendarName: chosen.name,
        connectedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw notAuthorized();
    return this.status(clinicId);
  }

  // ---- Porta 3: API do módulo para o sincronizador (HACK-19) ----

  /** Cliente autenticado (timeout de 10 s) e a agenda escolhida. */
  async getAuthorizedCalendar(
    clinicId: string,
  ): Promise<{ calendar: GoogleCalendarApi; calendarId: string }> {
    const row = await this.prisma.calendarConnection.findUnique({
      where: { clinicId },
    });
    if (
      !this.config ||
      row?.status !== 'CONNECTED' ||
      !row.refreshToken ||
      !row.calendarId
    ) {
      throw new CalendarNotConnectedError();
    }
    const calendar = this.google.calendarFor(
      this.credentials(this.config.encryptionKey, row),
      (tokens) => this.saveRefreshedAccessToken(clinicId, tokens),
    );
    return { calendar, calendarId: row.calendarId };
  }

  /** Google recusou as credenciais: `EXPIRED`, tokens apagados, agenda mantida. Idempotente. */
  async markCredentialsRejected(clinicId: string): Promise<void> {
    await this.prisma.calendarConnection.updateMany({
      where: { clinicId },
      data: {
        status: 'EXPIRED',
        refreshToken: null,
        accessToken: null,
        accessTokenExpiresAt: null,
      },
    });
  }

  async listConnectedClinicIds(): Promise<string[]> {
    const rows = await this.prisma.calendarConnection.findMany({
      where: { status: 'CONNECTED' },
      select: { clinicId: true },
    });
    return rows.map((row) => row.clinicId);
  }

  // ---- interno ----

  private credentials(key: Buffer, row: CalendarConnection): GoogleCredentials {
    if (!row.refreshToken) throw new CalendarNotConnectedError();
    return {
      refreshToken: decryptToken(key, row.clinicId, row.refreshToken),
      accessToken: row.accessToken
        ? decryptToken(key, row.clinicId, row.accessToken)
        : null,
      expiryDate: row.accessTokenExpiresAt?.getTime() ?? null,
    };
  }

  private async saveRefreshedAccessToken(
    clinicId: string,
    tokens: RefreshedTokens,
  ): Promise<void> {
    if (!this.config) return;
    try {
      await this.prisma.calendarConnection.updateMany({
        where: { clinicId, status: 'CONNECTED' },
        data: {
          accessToken: encryptToken(
            this.config.encryptionKey,
            clinicId,
            tokens.accessToken,
          ),
          accessTokenExpiresAt: tokens.expiryDate
            ? new Date(tokens.expiryDate)
            : null,
        },
      });
    } catch {
      this.logger.error('Falha ao gravar o access token renovado.');
    }
  }

  private async googleFailure(
    clinicId: string,
    operation: string,
    error: unknown,
  ): Promise<Error> {
    const failure = this.logFailure(operation, error);
    if (failure.kind === 'credentials_rejected') {
      await this.markCredentialsRejected(clinicId);
      return notAuthorized();
    }
    if (failure.kind === 'timeout') {
      return new GatewayTimeoutException({
        code: 'GOOGLE_TIMEOUT',
        message: 'A Google Agenda não respondeu a tempo. Tente de novo.',
      });
    }
    return new BadGatewayException({
      code: 'GOOGLE_UNAVAILABLE',
      message: 'A Google Agenda falhou. Tente de novo.',
    });
  }

  /** Registra só o tipo traduzido e o status HTTP; nunca o erro do `googleapis`. */
  private logFailure(operation: string, error: unknown): GoogleApiError {
    const failure = translateGoogleError(error);
    this.logger.warn(
      `Google falhou na ${operation}: ${failure.kind} (HTTP ${failure.httpStatus ?? 'sem status'})`,
    );
    return failure;
  }
}

function toConnection(
  row: CalendarConnection | null,
): GoogleCalendarConnection {
  if (!row) return { status: 'disconnected' };
  const status = STATUS_OUT[row.status];
  if (status === 'connected') {
    return {
      status,
      ...(row.calendarName ? { calendarName: row.calendarName } : {}),
      ...(row.connectedAt
        ? { connectedAt: row.connectedAt.toISOString() }
        : {}),
    };
  }
  return { status };
}
