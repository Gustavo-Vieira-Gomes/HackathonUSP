import { Inject, Injectable, Optional } from '@nestjs/common';
import { type calendar_v3, google } from 'googleapis';
import {
  APP_ENV,
  type AppEnv,
  type GoogleCalendarConfig,
  googleCalendarConfig,
} from '../../config/env';

/**
 * Único ponto do app que fala com o Google (HACK-18, porta 4). Os testes trocam os
 * métodos desta classe por falsos; nada fora daqui importa `googleapis`.
 */

/** Toda chamada ao Google: 10 s e nenhuma repetição (a troca do code é de uso único). */
export const GOOGLE_TIMEOUT_MS = 10_000;

/** Porta 6: eventos só das agendas da conta e leitura da lista de agendas. */
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const;

export type GoogleCalendarApi = calendar_v3.Calendar;

export interface GoogleCredentials {
  refreshToken: string;
  accessToken?: string | null;
  /** Instante (ms) em que o access token vence. */
  expiryDate?: number | null;
}

export interface ExchangedTokens {
  refreshToken?: string;
  accessToken?: string;
  expiryDate?: number;
}

export interface RefreshedTokens {
  accessToken: string;
  expiryDate?: number;
}

export interface GoogleCalendarCandidate {
  id: string;
  name: string;
  primary: boolean;
  accessRole: string;
}

/** Endereços do Google trocáveis só em teste (servidor local). */
export interface GoogleEndpoints {
  tokenUrl?: string;
  apiRootUrl?: string;
}

export const GOOGLE_ENDPOINTS = Symbol('GOOGLE_ENDPOINTS');

export type GoogleFailureKind =
  'credentials_rejected' | 'timeout' | 'unavailable';

/**
 * Falha do Google já traduzida: só o tipo e o status HTTP. Nunca carrega o erro do
 * `googleapis`, que leva a config da requisição (header Authorization, corpo da troca).
 */
export class GoogleApiError extends Error {
  override readonly name = 'GoogleApiError';
  constructor(
    readonly kind: GoogleFailureKind,
    readonly httpStatus?: number,
  ) {
    super(`Google ${kind}${httpStatus ? ` (HTTP ${httpStatus})` : ''}`);
  }
}

interface ErrorShape {
  code?: unknown;
  name?: unknown;
  status?: unknown;
  response?: { status?: unknown; data?: unknown };
}

function shape(error: unknown): ErrorShape | null {
  return typeof error === 'object' && error !== null
    ? (error as ErrorShape)
    : null;
}

function httpStatusOf(error: ErrorShape): number | undefined {
  const status = error.response?.status ?? error.status;
  return typeof status === 'number' ? status : undefined;
}

function oauthErrorOf(error: ErrorShape): unknown {
  const data = error.response?.data;
  return typeof data === 'object' && data !== null
    ? (data as { error?: unknown }).error
    : undefined;
}

/**
 * `true` quando o Google recusou as credenciais (`invalid_grant` ou HTTP 401):
 * expiradas ou revogadas. Vale para o erro cru do cliente devolvido ao HACK-19 e
 * para o já traduzido.
 */
export function isCredentialsRejectedError(error: unknown): boolean {
  if (error instanceof GoogleApiError) {
    return error.kind === 'credentials_rejected';
  }
  const value = shape(error);
  if (!value || !value.response) return false;
  return httpStatusOf(value) === 401 || oauthErrorOf(value) === 'invalid_grant';
}

function isTimeout(error: ErrorShape): boolean {
  return (
    error.code === 'TimeoutError' ||
    error.name === 'TimeoutError' ||
    error.code === 'ETIMEDOUT'
  );
}

export function translateGoogleError(error: unknown): GoogleApiError {
  if (error instanceof GoogleApiError) return error;
  const value = shape(error);
  if (!value) return new GoogleApiError('unavailable');
  if (isCredentialsRejectedError(value)) {
    return new GoogleApiError('credentials_rejected', httpStatusOf(value));
  }
  if (isTimeout(value)) return new GoogleApiError('timeout');
  return new GoogleApiError('unavailable', httpStatusOf(value));
}

type OAuth2 = InstanceType<typeof google.auth.OAuth2>;

@Injectable()
export class GoogleOAuthClient {
  private readonly config: GoogleCalendarConfig | null;

  constructor(
    @Inject(APP_ENV) env: AppEnv,
    @Optional()
    @Inject(GOOGLE_ENDPOINTS)
    private readonly endpoints: GoogleEndpoints = {},
  ) {
    this.config = googleCalendarConfig(env);
  }

  buildAuthUrl(state: string): string {
    return this.oauth().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: false,
      scope: [...GOOGLE_CALENDAR_SCOPES],
      state,
    });
  }

  async exchangeCode(code: string): Promise<ExchangedTokens> {
    try {
      const { tokens } = await this.oauth().getToken(code);
      return {
        refreshToken: tokens.refresh_token ?? undefined,
        accessToken: tokens.access_token ?? undefined,
        expiryDate: tokens.expiry_date ?? undefined,
      };
    } catch (error) {
      throw translateGoogleError(error);
    }
  }

  /**
   * Agendas da conta com o papel de cada uma; quem filtra `owner` é o serviço. A
   * renovação do access token durante a listagem chega em `onTokens`.
   */
  async listOwnedCalendars(
    credentials: GoogleCredentials,
    onTokens: (tokens: RefreshedTokens) => Promise<void> = async () =>
      undefined,
  ): Promise<GoogleCalendarCandidate[]> {
    const calendar = this.calendarFor(credentials, onTokens);
    const items: GoogleCalendarCandidate[] = [];
    let pageToken: string | undefined;
    try {
      do {
        const { data } = await calendar.calendarList.list({
          minAccessRole: 'owner',
          maxResults: 250,
          pageToken,
        });
        for (const item of data.items ?? []) {
          if (!item.id) continue;
          items.push({
            id: item.id,
            name: item.summaryOverride ?? item.summary ?? item.id,
            primary: item.primary === true,
            accessRole: item.accessRole ?? '',
          });
        }
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (error) {
      throw translateGoogleError(error);
    }
    return items;
  }

  /**
   * Cliente da Calendar API com as credenciais da clínica. Renovação do access token
   * chega em `onTokens`. Erros deste cliente saem crus do `googleapis`: o consumidor
   * classifica com `isCredentialsRejectedError` e nunca os registra inteiros.
   */
  calendarFor(
    credentials: GoogleCredentials,
    onTokens: (tokens: RefreshedTokens) => Promise<void>,
  ): GoogleCalendarApi {
    const auth = this.oauth();
    auth.setCredentials({
      refresh_token: credentials.refreshToken,
      access_token: credentials.accessToken ?? undefined,
      expiry_date: credentials.expiryDate ?? undefined,
    });
    auth.on('tokens', (tokens) => {
      if (!tokens.access_token) return;
      void onTokens({
        accessToken: tokens.access_token,
        expiryDate: tokens.expiry_date ?? undefined,
      });
    });
    return google.calendar({
      version: 'v3',
      auth,
      timeout: GOOGLE_TIMEOUT_MS,
      ...(this.endpoints.apiRootUrl
        ? { rootUrl: this.endpoints.apiRootUrl }
        : {}),
    });
  }

  private oauth(): OAuth2 {
    if (!this.config) {
      throw new Error('Google Agenda sem configuração neste ambiente.');
    }
    const client = new google.auth.OAuth2({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: this.config.redirectUri,
      transporterOptions: { timeout: GOOGLE_TIMEOUT_MS },
      ...(this.endpoints.tokenUrl
        ? { endpoints: { oauth2TokenUrl: this.endpoints.tokenUrl } }
        : {}),
    });
    // A biblioteca liga retry nas chamadas de token e da API; aqui cada chamada é
    // uma tentativa só, para o timeout de 10 s valer por chamada.
    client.transporter.interceptors.request.add({
      resolved: async (config) => ({
        ...config,
        retry: false,
        retryConfig: { ...config.retryConfig, retry: 0 },
      }),
    });
    return client;
  }
}
