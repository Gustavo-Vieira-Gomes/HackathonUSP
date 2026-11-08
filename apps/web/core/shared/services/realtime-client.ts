import {
  REALTIME_NAMESPACE,
  type RealtimeServerEventName,
  type RealtimeServerEventPayload,
  realtimeEvents,
  realtimeServerEventSchemas,
} from '@hackathon/contracts';
import { io, type Socket } from 'socket.io-client';

/**
 * Estado da conexão de tempo real exposto às telas. `nao_autenticado` é terminal:
 * o cliente para de tentar até um novo `acquire` depois do login.
 */
export type RealtimeStatus =
  | 'desconectado'
  | 'conectando'
  | 'conectado'
  | 'reconectando'
  | 'nao_autenticado';

/** A geração do token respondeu 401: não há sessão para abrir o socket. */
export class NaoAutenticadoError extends Error {
  override readonly name = 'NaoAutenticadoError';
}

export interface RealtimeClientOptions {
  /** Endereço público do Nest (`NEXT_PUBLIC_REALTIME_URL`). */
  url: string;
  /** Gera um token de uso único; lança `NaoAutenticadoError` sem sessão. */
  fetchToken?: () => Promise<string>;
  retryMinMs?: number;
  retryMaxMs?: number;
}

type Handler<E extends RealtimeServerEventName> = (
  payload: RealtimeServerEventPayload<E>,
) => void;

const TOKEN_TIMEOUT_MS = 10_000;

/** Pede o token ao repasse `/api/auth/*` do próprio Next, com o cookie da sessão. */
export async function fetchSocketToken(): Promise<string> {
  const response = await fetch('/api/auth/one-time-token/generate', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  if (response.status === 401) throw new NaoAutenticadoError();
  if (!response.ok) throw new Error(`token: status ${response.status}`);
  const body: unknown = await response.json();
  const token =
    typeof body === 'object' && body !== null && 'token' in body
      ? (body as { token: unknown }).token
      : undefined;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('token: resposta inválida');
  }
  return token;
}

/**
 * Uma conexão socket.io por aba, compartilhada pelos consumidores. Cada tentativa
 * de conexão pede um token novo; ao reconectar, reassina as vagas ativas e avisa
 * os consumidores para recarregarem o estado por HTTP (eventos são só avisos).
 */
export class RealtimeClient {
  private readonly socket: Socket;
  private readonly fetchToken: () => Promise<string>;
  private readonly retryMinMs: number;
  private readonly retryMaxMs: number;
  private readonly handlers = new Map<string, Set<(payload: never) => void>>();
  private readonly statusListeners = new Set<(s: RealtimeStatus) => void>();
  private readonly reconnectListeners = new Set<() => void>();
  private readonly vagas = new Map<string, number>();
  private consumidores = 0;
  private jaConectou = false;
  private tentativa = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private atual: RealtimeStatus = 'desconectado';

  constructor(options: RealtimeClientOptions) {
    this.fetchToken = options.fetchToken ?? fetchSocketToken;
    this.retryMinMs = options.retryMinMs ?? 500;
    this.retryMaxMs = options.retryMaxMs ?? 10_000;
    // Só websocket: o Nest fica em outra origem e não expõe CORS para polling.
    this.socket = io(`${options.url}${REALTIME_NAMESPACE}`, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
    });
    for (const [evento, schema] of Object.entries(realtimeServerEventSchemas)) {
      this.socket.on(evento, (payload: unknown) => {
        const parsed = schema.safeParse(payload);
        if (!parsed.success) return;
        for (const handler of this.handlers.get(evento) ?? []) {
          (handler as (p: unknown) => void)(parsed.data);
        }
      });
    }
    this.socket.on('connect', () => this.aoConectar());
    this.socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return;
      this.agendar();
    });
    this.socket.on('connect_error', (error: Error) => {
      if (error.message === 'unauthorized') this.pararSemSessao();
      else this.agendar();
    });
  }

  get status(): RealtimeStatus {
    return this.atual;
  }

  /** Registra um consumidor; a primeira chamada abre a conexão. */
  acquire(): () => void {
    this.consumidores++;
    if (this.consumidores === 1) {
      this.definir(this.jaConectou ? 'reconectando' : 'conectando');
      void this.tentar();
    }
    let solto = false;
    return () => {
      if (solto) return;
      solto = true;
      this.consumidores--;
      if (this.consumidores === 0) this.desligar('desconectado');
    };
  }

  on<E extends RealtimeServerEventName>(
    evento: E,
    handler: Handler<E>,
  ): () => void {
    const set = this.handlers.get(evento) ?? new Set();
    set.add(handler as (payload: never) => void);
    this.handlers.set(evento, set);
    return () => set.delete(handler as (payload: never) => void);
  }

  onStatus(listener: (s: RealtimeStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  /** Assina a sala da vaga; a liberação sai da sala quando ninguém mais assina. */
  assinarVaga(vagaId: string): () => void {
    const total = (this.vagas.get(vagaId) ?? 0) + 1;
    this.vagas.set(vagaId, total);
    if (total === 1 && this.socket.connected) {
      this.socket.emit(realtimeEvents.vagaAssinar, { vagaId });
    }
    let solto = false;
    return () => {
      if (solto) return;
      solto = true;
      const restante = (this.vagas.get(vagaId) ?? 1) - 1;
      if (restante > 0) {
        this.vagas.set(vagaId, restante);
        return;
      }
      this.vagas.delete(vagaId);
      if (this.socket.connected) {
        this.socket.emit(realtimeEvents.vagaSair, { vagaId });
      }
    };
  }

  /** Fecha a conexão e para as tentativas (logout, testes). */
  close(): void {
    this.consumidores = 0;
    this.desligar('desconectado');
  }

  private aoConectar(): void {
    this.tentativa = 0;
    for (const vagaId of this.vagas.keys()) {
      this.socket.emit(realtimeEvents.vagaAssinar, { vagaId });
    }
    const reconexao = this.jaConectou;
    this.jaConectou = true;
    this.definir('conectado');
    if (reconexao) for (const listener of this.reconnectListeners) listener();
  }

  private async tentar(): Promise<void> {
    this.timer = undefined;
    if (this.consumidores === 0 || this.socket.connected) return;
    let token: string;
    try {
      token = await this.fetchToken();
    } catch (error) {
      if (error instanceof NaoAutenticadoError) this.pararSemSessao();
      else this.agendar();
      return;
    }
    if (this.consumidores === 0 || this.atual === 'nao_autenticado') return;
    this.socket.auth = { token };
    this.socket.connect();
  }

  private agendar(): void {
    if (this.consumidores === 0 || this.atual === 'nao_autenticado') return;
    this.definir(this.jaConectou ? 'reconectando' : 'conectando');
    if (this.timer) return;
    const espera = Math.min(
      this.retryMinMs * 2 ** this.tentativa,
      this.retryMaxMs,
    );
    this.tentativa++;
    this.timer = setTimeout(() => void this.tentar(), espera);
  }

  private pararSemSessao(): void {
    this.desligar('nao_autenticado');
  }

  private desligar(status: RealtimeStatus): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.socket.disconnect();
    this.definir(status);
  }

  private definir(status: RealtimeStatus): void {
    if (status === this.atual) return;
    this.atual = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

let compartilhado: RealtimeClient | undefined;

/** Cliente único da aba, no endereço de `NEXT_PUBLIC_REALTIME_URL`. */
export function getRealtimeClient(
  options: Omit<RealtimeClientOptions, 'url'> = {},
): RealtimeClient {
  if (!compartilhado) {
    const url = process.env.NEXT_PUBLIC_REALTIME_URL;
    if (!url) throw new Error('NEXT_PUBLIC_REALTIME_URL não configurada.');
    compartilhado = new RealtimeClient({ ...options, url });
  }
  return compartilhado;
}
