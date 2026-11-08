import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ResendCall {
  headers: IncomingHttpHeaders;
  body: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
  };
}

/** Uma resposta por requisição, na ordem; `hang` nunca responde. */
export type FakeReply = { status: number; body?: unknown } | 'hang';

/**
 * Servidor HTTP local no lugar do Resend, em porta efêmera. Mock não prova o
 * comportamento do fornecedor: prova só o nosso lado do contrato (headers,
 * corpo, retentativa e tempo limite).
 */
export async function startFakeResend(replies: FakeReply[] = []) {
  const calls: ResendCall[] = [];
  const queue = [...replies];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      calls.push({
        headers: req.headers,
        body: JSON.parse(raw) as ResendCall['body'],
      });
      const reply = queue.shift() ?? {
        status: 200,
        body: { id: `email-${calls.length}` },
      };
      if (reply === 'hang') return;
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply.body ?? {}));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    reply: (...more: FakeReply[]) => queue.push(...more),
    /** Zera chamadas e respostas pendentes entre testes. */
    reset: () => {
      calls.length = 0;
      queue.length = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
