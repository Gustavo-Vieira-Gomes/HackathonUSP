import { type NextRequest, NextResponse } from 'next/server';
import {
  checkDemoAccess,
  DEMO_AUTH_CHALLENGE,
} from '@/core/shared/lib/demo-access';

/**
 * Telas de demo (`/demo/*`) só para o operador (HACK-37): elas mostram dados que a
 * API protege, como telefones e códigos de verificação. Sem segredo configurado,
 * 404; sem credencial ou com credencial errada, 401 com o desafio do Basic Auth.
 * As páginas conferem de novo antes de buscar dados.
 */
export function proxy(request: NextRequest) {
  const access = checkDemoAccess(request.headers.get('authorization'));
  if (access === 'ok') {
    const response = NextResponse.next();
    response.headers.set('cache-control', 'no-store');
    return response;
  }
  if (access === 'disabled') {
    return new NextResponse('Não encontrado.', {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    });
  }
  return new NextResponse('Acesso restrito ao operador da demo.', {
    status: 401,
    headers: {
      'www-authenticate': DEMO_AUTH_CHALLENGE,
      'cache-control': 'no-store',
    },
  });
}

export const config = {
  matcher: '/demo/:path*',
};
