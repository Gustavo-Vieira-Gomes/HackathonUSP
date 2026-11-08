import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

/**
 * Exemplo de gateway socket.io no namespace padrão. Sem autenticação: só ecoa
 * ping/pong, sem dado. A autenticação no handshake é do HACK-38.
 */
@AllowAnonymous()
@WebSocketGateway()
export class ExampleGateway {
  @SubscribeMessage('ping')
  ping(): { event: 'pong'; data: { ok: true } } {
    return { event: 'pong', data: { ok: true } };
  }
}
