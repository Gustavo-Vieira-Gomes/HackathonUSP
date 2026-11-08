'use client';

import type {
  RealtimeServerEventName,
  RealtimeServerEventPayload,
} from '@hackathon/contracts';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  type RealtimeStatus,
  getRealtimeClient,
} from '@/core/shared/services/realtime-client';

export interface UseRealtimeOptions {
  /** Handlers por evento; recebem só payload que passou no schema de contrato. */
  eventos?: {
    [E in RealtimeServerEventName]?: (
      payload: RealtimeServerEventPayload<E>,
    ) => void;
  };
  /** Vaga cuja sala esta tela acompanha (preço e vaga preenchida). */
  vagaId?: string;
  /** Chamado ao reconectar: a tela recarrega o estado por HTTP. */
  onReconnect?: () => void;
}

/**
 * Invólucro React do cliente de tempo real: abre a conexão compartilhada da aba
 * enquanto a tela está montada e devolve o estado da conexão.
 */
export function useRealtime(options: UseRealtimeOptions = {}): RealtimeStatus {
  const client = getRealtimeClient();
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => client.acquire(), [client]);

  useEffect(() => {
    const solturas = (
      Object.keys(latest.current.eventos ?? {}) as RealtimeServerEventName[]
    ).map((evento) =>
      client.on(evento, (payload) => {
        const handler = latest.current.eventos?.[evento] as
          ((p: typeof payload) => void) | undefined;
        handler?.(payload);
      }),
    );
    const semReconexao = client.onReconnect(() =>
      latest.current.onReconnect?.(),
    );
    return () => {
      for (const solta of solturas) solta();
      semReconexao();
    };
  }, [client]);

  const { vagaId } = options;
  useEffect(() => {
    if (!vagaId) return;
    return client.assinarVaga(vagaId);
  }, [client, vagaId]);

  return useSyncExternalStore(
    (notify) => client.onStatus(notify),
    () => client.status,
    () => 'desconectado',
  );
}
