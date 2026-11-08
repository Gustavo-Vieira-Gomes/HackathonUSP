import { setTimeout as sleep } from 'node:timers/promises';
import { REALTIME_NAMESPACE } from '@hackathon/contracts';
import { io, type Socket } from 'socket.io-client';
import { jsonRequest, type TestApp } from '../../testing/test-app';
import { RealtimeGateway } from './realtime.gateway';

/** Espera para afirmar que um evento NÃO chegou (mesmo processo, ordem por conexão). */
export const NAO_RECEBEU_MS = 300;

export interface ConnectOptions {
  token?: string;
  cookie?: string;
  /** `null` não envia o header `Origin`; padrão: `WEB_ORIGIN`. */
  origin?: string | null;
  auth?: Record<string, unknown>;
  query?: Record<string, string>;
}

/** Abre um cliente socket.io sem reconexão e rejeita com a mensagem do `connect_error`. */
export function connect(t: TestApp, options: ConnectOptions = {}) {
  const headers: Record<string, string> = {};
  const origin =
    options.origin === undefined ? t.env.WEB_ORIGIN : options.origin;
  if (origin !== null) headers.origin = origin;
  if (options.cookie) headers.cookie = options.cookie;
  const socket: Socket = io(`${t.url}${REALTIME_NAMESPACE}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: 5000,
    extraHeaders: headers,
    auth: {
      ...(options.token === undefined ? {} : { token: options.token }),
      ...options.auth,
    },
    query: options.query,
  });
  return new Promise<Socket>((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error: Error) => {
      socket.close();
      reject(error);
    });
  });
}

/** Mensagem do `connect_error` de uma conexão que deveria ser recusada. */
export async function connectError(
  t: TestApp,
  options: ConnectOptions = {},
): Promise<string> {
  try {
    const socket = await connect(t, options);
    socket.close();
    return 'conectou';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Gera um token de uso único pela rota do Better Auth, com o cookie da sessão. */
export async function generateToken(
  t: TestApp,
  cookie: string,
): Promise<string> {
  const response = await jsonRequest(
    t,
    'GET',
    '/api/auth/one-time-token/generate',
    undefined,
    { cookie },
  );
  if (response.status !== 200) {
    throw new Error(`generate respondeu ${response.status}`);
  }
  const { token } = (await response.json()) as { token: string };
  return token;
}

/** Salas do socket no servidor (inclui a sala com o próprio id do socket). */
export function serverRooms(t: TestApp, socket: Socket): Set<string> {
  const id = socket.id;
  if (!id) throw new Error('socket sem id');
  const serverSocket = t.app.get(RealtimeGateway).server.sockets.get(id);
  if (!serverSocket) throw new Error(`socket ${id} não está no namespace`);
  return new Set(serverSocket.rooms);
}

/** Quantos sockets estão conectados ao namespace. */
export function namespaceSize(t: TestApp): number {
  return t.app.get(RealtimeGateway).server.sockets.size;
}

/** Acumula os payloads de um evento recebido pelo cliente. */
export function collect(socket: Socket, event: string): unknown[] {
  const received: unknown[] = [];
  socket.on(event, (payload: unknown) => received.push(payload));
  return received;
}

/** Espera até `predicate` ficar verdadeiro, com teto de 3 s. */
export async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error('condição não atingida em 3 s');
}

export function closeAll(sockets: Socket[]): void {
  for (const socket of sockets) socket.close();
}
