import 'server-only';
import {
  type SimulatedWhatsappMessage,
  simulatedWhatsappMessagesResponseSchema,
} from '@hackathon/contracts';
import {
  type ApiCallOptions,
  apiBaseUrl,
} from '@/core/shared/services/api-proxy.service';

export const WHATSAPP_DEMO_TIMEOUT_MS = 5_000;

export type WhatsappDemoResult =
  | { status: 'ok'; messages: SimulatedWhatsappMessage[] }
  /** Demo desligada na API (404) ou token ausente no servidor do Next. */
  | { status: 'disabled' }
  /** Token do Next recusado pela API (401/403). */
  | { status: 'unauthorized' }
  /** API fora, lenta ou com resposta fora do contrato. */
  | { status: 'error' };

/**
 * Mensagens do WhatsApp simulado (HACK-37), lidas no servidor do Next com o segredo
 * do operador da demo. O token nunca vai para o navegador: este módulo é
 * `server-only` e só a página o usa.
 */
export async function getSimulatedWhatsappMessages(
  options: ApiCallOptions & { token?: string } = {},
): Promise<WhatsappDemoResult> {
  const token = options.token ?? process.env.DEMO_CLOCK_TOKEN;
  if (!token) return { status: 'disabled' };
  try {
    const response = await fetch(
      new URL('/api/demo/whatsapp/messages', options.baseUrl ?? apiBaseUrl()),
      {
        headers: { 'x-demo-clock-token': token },
        cache: 'no-store',
        signal: AbortSignal.timeout(
          options.timeoutMs ?? WHATSAPP_DEMO_TIMEOUT_MS,
        ),
      },
    );
    if (response.status === 404) return { status: 'disabled' };
    if (response.status === 401 || response.status === 403) {
      return { status: 'unauthorized' };
    }
    if (!response.ok) return { status: 'error' };
    const parsed = simulatedWhatsappMessagesResponseSchema.safeParse(
      await response.json(),
    );
    return parsed.success
      ? { status: 'ok', messages: parsed.data.messages }
      : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

export interface Conversation {
  phone: string;
  /** Da mais antiga para a mais nova, como numa conversa. */
  messages: SimulatedWhatsappMessage[];
}

/** Agrupa por telefone; a conversa com a mensagem mais recente vem primeiro. */
export function groupByPhone(
  messages: readonly SimulatedWhatsappMessage[],
): Conversation[] {
  const byPhone = new Map<string, SimulatedWhatsappMessage[]>();
  for (const message of messages) {
    const list = byPhone.get(message.phone) ?? [];
    list.push(message);
    byPhone.set(message.phone, list);
  }
  return [...byPhone.entries()]
    .map(([phone, list]) => ({
      phone,
      messages: [...list].sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    }))
    .sort((a, b) => {
      const lastA = a.messages.at(-1)?.sentAt ?? '';
      const lastB = b.messages.at(-1)?.sentAt ?? '';
      return lastB.localeCompare(lastA);
    });
}
