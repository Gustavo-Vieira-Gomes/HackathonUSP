import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import type { AppEnv } from '../config/env';

/** Antes do router Better Auth: autentica o proxy e elimina IPs vindos da internet. */
export function authProxyMiddleware(env: AppEnv) {
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): void => {
    const ip = req.headers['x-hackathon-client-ip'];
    const key = req.headers['x-hackathon-proxy-key'];
    delete req.headers['x-hackathon-client-ip'];
    delete req.headers['x-hackathon-proxy-key'];
    // Better Auth só lê o header acima. Nenhum fallback para XFF/Render é permitido.
    let path: string;
    try {
      path = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!/^\/api\/(auth|sign-up)(\/|$)/i.test(path)) {
      next();
      return;
    }
    if (!env.AUTH_PROXY_SECRET) {
      // Desenvolvimento local: ignora inclusive headers internos forjados.
      req.headers['x-hackathon-client-ip'] = req.socket.remoteAddress;
      next();
      return;
    }
    const expected = Buffer.from(env.AUTH_PROXY_SECRET);
    if (
      typeof key !== 'string' ||
      Buffer.byteLength(key) !== expected.length ||
      !timingSafeEqual(Buffer.from(key), expected)
    ) {
      res.writeHead(403, { 'cache-control': 'no-store' }).end();
      return;
    }
    if (typeof ip !== 'string' || !isIP(ip)) {
      res.writeHead(400, { 'cache-control': 'no-store' }).end();
      return;
    }
    req.headers['x-hackathon-client-ip'] = ip;
    next();
  };
}
