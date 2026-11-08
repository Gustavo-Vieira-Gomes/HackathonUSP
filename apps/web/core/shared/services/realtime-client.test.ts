import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, test } from 'node:test';
import { Server, type Socket } from 'socket.io';
import {
  RealtimeClient,
  type RealtimeStatus,
  getRealtimeClient,
} from './realtime-client';

/** Servidor socket.io local no lugar do Nest, no namespace /realtime. */
interface TestServer {
  url: string;
  port: number;
  tokens: string[];
  handshakes: number;
  conexoes: Socket[];
  assinaturas: string[];
  /** Quando definido, o middleware recusa com esta mensagem. */
  recusar?: string;
  close(): Promise<void>;
}

async function startServer(port = 0): Promise<TestServer> {
  const http: HttpServer = createServer();
  http.listen(port, '127.0.0.1');
  await once(http, 'listening');
  const { port: real } = http.address() as AddressInfo;
  const io = new Server(http);
  const state: TestServer = {
    url: `http://127.0.0.1:${real}`,
    port: real,
    tokens: [],
    handshakes: 0,
    conexoes: [],
    assinaturas: [],
    close: async () => {
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
  const nsp = io.of('/realtime');
  nsp.use((socket, next) => {
    state.handshakes++;
    state.tokens.push(
      String((socket.handshake.auth as { token?: unknown }).token),
    );
    if (state.recusar) next(new Error(state.recusar));
    else next();
  });
  nsp.on('connection', (socket) => {
    state.conexoes.push(socket);
    socket.on(
      'vaga.assinar',
      (body: { vagaId: string }, ack?: (v: unknown) => void) => {
        state.assinaturas.push(body.vagaId);
        ack?.({ ok: true });
      },
    );
    socket.on('vaga.sair', (_body: unknown, ack?: (v: unknown) => void) => {
      ack?.({ ok: true });
    });
  });
  return state;
}

async function until(predicate: () => boolean, ms = 5000): Promise<void> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (predicate()) return;
    await sleep(20);
  }
  throw new Error('condição não atingida');
}

function tokens(): () => Promise<string> {
  let n = 0;
  return async () => `token-${++n}`;
}

const abertos: Array<{ close(): unknown }> = [];
afterEach(async () => {
  for (const item of abertos.splice(0)) await item.close();
});

function cliente(
  server: TestServer,
  fetchToken = tokens(),
  retryMinMs = 50,
): RealtimeClient {
  const client = new RealtimeClient({
    url: server.url,
    fetchToken,
    retryMinMs,
    retryMaxMs: 400,
  });
  abertos.push({ close: () => client.close() });
  return client;
}

test('C22 - dois consumidores na mesma aba usam uma só conexão em NEXT_PUBLIC_REALTIME_URL/realtime', async () => {
  const server = await startServer();
  abertos.push(server);
  const anterior = process.env.NEXT_PUBLIC_REALTIME_URL;
  process.env.NEXT_PUBLIC_REALTIME_URL = server.url;
  try {
    const a = getRealtimeClient({ fetchToken: tokens() });
    const b = getRealtimeClient();
    assert.equal(a, b);
    abertos.push({ close: () => a.close() });
    const soltaA = a.acquire();
    const soltaB = b.acquire();
    await until(() => a.status === 'conectado');
    await sleep(100);
    assert.equal(server.conexoes.length, 1);
    assert.equal(server.conexoes[0]?.nsp.name, '/realtime');
    soltaA();
    soltaB();
  } finally {
    process.env.NEXT_PUBLIC_REALTIME_URL = anterior;
  }
});

test('C23 - cada tentativa de conexão leva um token novo', async () => {
  const server = await startServer();
  const geracoes: string[] = [];
  const gerar = tokens();
  // Espera de 400 ms antes da 1ª nova tentativa: o servidor volta antes dela.
  const client = cliente(
    server,
    async () => {
      const token = await gerar();
      geracoes.push(token);
      return token;
    },
    400,
  );
  client.acquire();
  await until(() => client.status === 'conectado');
  await server.close();
  await until(() => client.status === 'reconectando');
  const volta = await startServer(server.port);
  abertos.push(volta);
  await until(() => client.status === 'conectado');
  assert.deepEqual([...server.tokens, ...volta.tokens], ['token-1', 'token-2']);
  assert.equal(geracoes.length, 2);
});

test('C24 - ao reconectar reassina as vagas ativas e chama o callback de cada consumidor uma vez', async () => {
  const server = await startServer();
  const client = cliente(server);
  client.acquire();
  const chamadas = [0, 0];
  client.onReconnect(() => chamadas[0]!++);
  client.onReconnect(() => chamadas[1]!++);
  client.assinarVaga('v1');
  client.assinarVaga('v2');
  const soltaV3 = client.assinarVaga('v3');
  await until(() => client.status === 'conectado');
  await until(() => server.assinaturas.length === 3);
  soltaV3();
  await server.close();
  await until(() => client.status === 'reconectando');
  const volta = await startServer(server.port);
  abertos.push(volta);
  await until(() => client.status === 'conectado');
  await until(() => volta.assinaturas.length === 2);
  await sleep(100);
  assert.deepEqual([...volta.assinaturas].sort(), ['v1', 'v2']);
  assert.deepEqual(chamadas, [1, 1]);
});

test('C25 - evento fora do schema é descartado sem chamar o consumidor', async () => {
  const server = await startServer();
  abertos.push(server);
  const client = cliente(server);
  client.acquire();
  const recebidos: number[] = [];
  client.on('vaga.preco', (payload) => recebidos.push(payload.precoCentavos));
  await until(() => server.conexoes.length === 1);
  await until(() => client.status === 'conectado');
  const em = new Date().toISOString();
  server.conexoes[0]?.emit('vaga.preco', {
    vagaId: 'v1',
    precoCentavos: -5,
    em,
  });
  server.conexoes[0]?.emit('vaga.preco', {
    vagaId: 'v1',
    precoCentavos: 300,
    em,
  });
  await until(() => recebidos.length >= 1);
  await sleep(100);
  assert.deepEqual(recebidos, [300]);
});

test('C26 - estado conectado, reconectando com o servidor caído e conectado de novo', async () => {
  const server = await startServer();
  const client = cliente(server);
  const estados: RealtimeStatus[] = [];
  client.onStatus((status) => estados.push(status));
  client.acquire();
  await until(() => client.status === 'conectado');
  await server.close();
  await until(() => client.status === 'reconectando');
  const volta = await startServer(server.port);
  abertos.push(volta);
  await until(() => client.status === 'conectado');
  const sequencia = estados.filter((s, i) => s !== estados[i - 1]);
  assert.deepEqual(sequencia.slice(-3), [
    'conectado',
    'reconectando',
    'conectado',
  ]);
});

test('C27 - geração 401 ou handshake unauthorized: nao_autenticado e sem novas tentativas', async () => {
  // Caso 1: a geração do token responde 401. Usa o fetchSocketToken real (default
  // do cliente); o fetch global resolve o caminho relativo contra um HTTP local
  // que responde 401, no lugar do repasse /api/auth/* do Next.
  const server = await startServer();
  abertos.push(server);
  const geracoes: string[] = [];
  const auth = createServer((req, res) => {
    geracoes.push(`${req.method} ${req.url}`);
    res.writeHead(401).end();
  });
  auth.listen(0, '127.0.0.1');
  await once(auth, 'listening');
  const { port: authPort } = auth.address() as AddressInfo;
  abertos.push({
    close: () => new Promise<void>((resolve) => auth.close(() => resolve())),
  });
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (input, init) =>
    fetchOriginal(new URL(String(input), `http://127.0.0.1:${authPort}`), init);
  abertos.push({ close: () => (globalThis.fetch = fetchOriginal) });
  const semSessao = new RealtimeClient({
    url: server.url,
    retryMinMs: 50,
    retryMaxMs: 400,
  });
  abertos.push({ close: () => semSessao.close() });
  semSessao.acquire();
  await until(() => semSessao.status === 'nao_autenticado');
  await sleep(1000);
  assert.deepEqual(geracoes, ['GET /api/auth/one-time-token/generate']);
  assert.equal(server.handshakes, 0);
  assert.equal(semSessao.status, 'nao_autenticado');

  // Caso 2: o servidor recusa o handshake com unauthorized.
  const recusa = await startServer();
  abertos.push(recusa);
  recusa.recusar = 'unauthorized';
  const recusado = cliente(recusa);
  recusado.acquire();
  await until(() => recusado.status === 'nao_autenticado');
  const depois = recusa.handshakes;
  await sleep(1000);
  assert.equal(recusa.handshakes, depois);
  assert.equal(recusado.status, 'nao_autenticado');
});
