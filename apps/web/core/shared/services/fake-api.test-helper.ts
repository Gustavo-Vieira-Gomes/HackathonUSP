import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

export interface FakeReply {
  status: number;
  body?: string;
  headers?: Record<string, string | string[]>;
}

/** Servidor HTTP local no lugar do Nest: grava o que recebeu e responde o roteiro. */
export async function startFakeApi(
  reply: (request: RecordedRequest) => FakeReply | null,
) {
  const requests: RecordedRequest[] = [];
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const recorded = {
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers,
      body: Buffer.concat(chunks).toString(),
    };
    requests.push(recorded);
    const answer = reply(recorded);
    if (!answer) return; // nunca responde: simula a API travada
    res.writeHead(answer.status, answer.headers);
    res.end(answer.body ?? '');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Porta livre sem ninguém escutando (conexão recusada). */
export async function closedPortUrl(): Promise<string> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}
