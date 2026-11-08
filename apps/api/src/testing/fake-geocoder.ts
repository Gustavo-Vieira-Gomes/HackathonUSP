import { once } from 'node:events';
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Geocodificador falso (forma do Nominatim) em porta efêmera. Nenhum teste chama o
 * fornecedor real: o harness aponta `GEOCODER_URL` para cá. Responde por padrão
 * `[{ lat: '-23.5617', lon: '-46.6560' }]`; `respond` troca o comportamento.
 */
export const FAKE_POINT = { latitude: -23.5617, longitude: -46.656 };

export interface GeocoderRequest {
  url: URL;
  headers: IncomingHttpHeaders;
  at: number;
}

export type GeocoderHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

export interface FakeGeocoder {
  url: string;
  requests: GeocoderRequest[];
  respond(handler: GeocoderHandler): void;
  reset(): void;
  close(): Promise<void>;
}

export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export const defaultHandler: GeocoderHandler = (_req, res) =>
  json(res, 200, [{ lat: '-23.5617', lon: '-46.6560' }]);

export async function startFakeGeocoder(): Promise<FakeGeocoder> {
  const requests: GeocoderRequest[] = [];
  let handler = defaultHandler;
  const server = createServer((req, res) => {
    requests.push({
      url: new URL(req.url ?? '/', 'http://fake'),
      headers: req.headers,
      at: Date.now(),
    });
    void Promise.resolve(handler(req, res)).catch(() => res.destroy());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    respond: (next) => {
      handler = next;
    },
    reset: () => {
      handler = defaultHandler;
      requests.length = 0;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Porta onde ninguém escuta: sobe um servidor, guarda a porta e fecha. */
export async function closedPortUrl(): Promise<string> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}
