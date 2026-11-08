import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { APP_ENV, type AppEnv } from '../../config/env';

/** Tempo máximo por chamada ao geocodificador; sem retentativa. */
export const GEOCODING_TIMEOUT_MS = 5_000;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const coordinate = z
  .string()
  .trim()
  .min(1)
  .refine((value) => Number.isFinite(Number(value)));

/** Forma da resposta do Nominatim (`format=jsonv2`): só o que usamos. */
const responseSchema = z.array(z.object({ lat: coordinate, lon: coordinate }));

type FailureReason =
  `status=${number}` | 'timeout' | 'network' | 'invalid_body';

/**
 * Endereço → coordenada pelo Nominatim (HACK-16, porta 5). Lista vazia → `null`
 * (endereço não achado); status ≠ 200, timeout, rede ou formato inválido →
 * 503 `GEOCODING_UNAVAILABLE` e uma linha `warn` com o motivo e a duração, sem o
 * endereço. As chamadas deste processo saem uma por vez, cada uma pelo menos
 * `GEOCODER_MIN_INTERVAL_MS` depois do fim da anterior (política do Nominatim:
 * 1 req/s); a fila vive só na memória do processo, sem nada durável.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private turns: Promise<void> = Promise.resolve();
  private nextStartAt = 0;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.baseUrl = env.GEOCODER_URL;
    this.userAgent = env.GEOCODER_USER_AGENT;
    this.minIntervalMs = env.GEOCODER_MIN_INTERVAL_MS;
  }

  /**
   * Uma chamada por vez; a seguinte começa `minIntervalMs` depois do fim desta.
   * Com intervalo 0 (testes), as chamadas saem sem fila.
   */
  async geocode(address: string): Promise<GeoPoint | null> {
    if (this.minIntervalMs === 0) return this.request(address);
    const previous = this.turns;
    let done!: () => void;
    this.turns = new Promise<void>((resolve) => {
      done = resolve;
    });
    await previous;
    const wait = this.nextStartAt - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await this.request(address);
    } finally {
      this.nextStartAt = Date.now() + this.minIntervalMs;
      done();
    }
  }

  private async request(address: string): Promise<GeoPoint | null> {
    const url = new URL('search', withTrailingSlash(this.baseUrl));
    url.search = new URLSearchParams({
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'br',
      q: address,
    }).toString();
    const started = performance.now();
    const fail = (reason: FailureReason): never => {
      const ms = Math.round(performance.now() - started);
      this.logger.warn(`Geocodificação indisponível: ${reason} em ${ms}ms`);
      throw new ServiceUnavailableException({
        code: 'GEOCODING_UNAVAILABLE',
        message:
          'Não foi possível localizar o endereço agora. Tente de novo em instantes.',
      });
    };

    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        headers: { 'user-agent': this.userAgent, accept: 'application/json' },
        signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS),
      });
    } catch (error) {
      return fail(isTimeout(error) ? 'timeout' : 'network');
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      return fail(`status=${response.status}`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      return fail(isTimeout(error) ? 'timeout' : 'invalid_body');
    }

    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) return fail('invalid_body');
    const [first] = parsed.data;
    if (!first) return null;
    return { latitude: Number(first.lat), longitude: Number(first.lon) };
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
