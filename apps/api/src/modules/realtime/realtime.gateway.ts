import type { IncomingMessage } from 'node:http';
import {
  REALTIME_NAMESPACE,
  type RealtimeAck,
  type SessionUser,
  realtimeEvents,
  vagaAssinaturaSchema,
} from '@hackathon/contracts';
import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import {
  type AuthSession,
  AuthSessionService,
} from '../../auth/auth-session.service';
import { APP_ENV, type AppEnv } from '../../config/env';
import {
  MAX_SALAS_DE_VAGA,
  contarSalasDeVaga,
  salaDaVaga,
  salaDoUsuario,
} from './realtime.rooms';

/** Dados que o middleware do handshake grava na conexão. */
interface SocketData {
  user: SessionUser;
}

type RealtimeSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

/**
 * Canal socket.io autenticado pela sessão do Better Auth (HACK-38).
 *
 * No Nest 11 os guards globais (inclusive o `APP_GUARD` do Better Auth) não rodam
 * em mensagens de gateway (`@nestjs/websockets/socket-module.js:81`). A
 * autenticação é feita uma vez, no middleware do namespace; os handlers leem o
 * usuário só de `socket.data`, nunca do payload.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  readonly server!: Namespace;

  constructor(
    private readonly sessions: AuthSessionService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  afterInit(namespace: Namespace): void {
    const origemPermitida = new URL(this.env.WEB_ORIGIN).origin;
    // Origem conferida antes de qualquer conexão: o engine.io responde 403 no
    // polling e 400 no upgrade websocket (desvio M1 do plano).
    namespace.server.engine.opts.allowRequest = (
      request: IncomingMessage,
      callback: (error: string | null | undefined, success: boolean) => void,
    ) => {
      callback(null, request.headers.origin === origemPermitida);
    };
    namespace.use((socket, next) => {
      this.autenticar(socket).then(
        (user) => {
          (socket as RealtimeSocket).data.user = user;
          next();
        },
        (error: unknown) =>
          next(error instanceof Error ? error : new Error('unavailable')),
      );
    });
  }

  async handleConnection(socket: RealtimeSocket): Promise<void> {
    await socket.join(salaDoUsuario(socket.data.user));
  }

  @SubscribeMessage(realtimeEvents.vagaAssinar)
  async assinar(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    const parsed = vagaAssinaturaSchema.safeParse(body);
    if (!parsed.success) return { ok: false, erro: 'payload_invalido' };
    const sala = salaDaVaga(parsed.data.vagaId);
    if (
      !socket.rooms.has(sala) &&
      contarSalasDeVaga(socket.rooms) >= MAX_SALAS_DE_VAGA
    ) {
      return { ok: false, erro: 'limite_assinaturas' };
    }
    await socket.join(sala);
    return { ok: true };
  }

  @SubscribeMessage(realtimeEvents.vagaSair)
  async sair(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    const parsed = vagaAssinaturaSchema.safeParse(body);
    if (!parsed.success) return { ok: false, erro: 'payload_invalido' };
    await socket.leave(salaDaVaga(parsed.data.vagaId));
    return { ok: true };
  }

  /**
   * Token de uso único em `auth.token`; sem ele, o cookie do handshake (dev).
   * Token presente e inválido recusa sem cair no cookie.
   */
  private async autenticar(socket: Socket): Promise<SessionUser> {
    const auth: unknown = socket.handshake.auth;
    const token =
      typeof auth === 'object' && auth !== null && 'token' in auth
        ? (auth as { token: unknown }).token
        : undefined;
    let session: AuthSession | null;
    try {
      if (token === undefined) {
        session = await this.sessions.getSession(socket.handshake.headers);
      } else {
        session =
          typeof token === 'string' && token.length > 0
            ? await this.sessions.verifyOneTimeToken(token)
            : null;
      }
    } catch (error) {
      // Só o tipo do erro: a mensagem de um driver pode citar dados da conexão.
      const tipo = error instanceof Error ? error.name : typeof error;
      this.logger.error(`Falha ao verificar a sessão no handshake (${tipo}).`);
      throw new Error('unavailable');
    }
    if (!session) throw new Error('unauthorized');
    return session.user;
  }
}
