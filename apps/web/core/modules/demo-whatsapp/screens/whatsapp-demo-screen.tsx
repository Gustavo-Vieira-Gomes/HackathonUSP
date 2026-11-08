import { AutoRefresh } from '../components/auto-refresh';
import { MessageText } from '../components/message-text';
import {
  groupByPhone,
  type WhatsappDemoResult,
} from '../services/whatsapp-demo.server.service';

export const REFRESH_INTERVAL_MS = 3_000;

const time = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const STATUS_TEXT: Record<
  Exclude<WhatsappDemoResult['status'], 'ok'>,
  string
> = {
  disabled:
    'O WhatsApp simulado está desligado. Ligue DEMO_CLOCK_ENABLED, DEMO_CLOCK_TOKEN e WHATSAPP_MODE=simulated na API e configure DEMO_CLOCK_TOKEN no Next.',
  unauthorized:
    'A API recusou o token do operador da demo. Confira se DEMO_CLOCK_TOKEN é o mesmo no Next e na API.',
  error:
    'Não foi possível carregar as mensagens agora. A página tenta de novo em alguns segundos.',
};

/**
 * Tela da demo que imita o WhatsApp (HACK-37). Mostra as mensagens que o piloto
 * enviaria, agrupadas por telefone, e se atualiza sozinha. O aviso no topo deixa
 * claro que nada foi enviado de verdade.
 */
export function WhatsappDemoScreen({ result }: { result: WhatsappDemoResult }) {
  const conversations =
    result.status === 'ok' ? groupByPhone(result.messages) : [];
  return (
    <main className="wa-demo">
      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
      <header className="wa-header">
        <h1>WhatsApp simulado</h1>
        <p className="wa-notice" role="note">
          Demonstração: nenhuma mensagem é enviada de verdade. Aqui aparecem as
          mensagens que o piloto mandaria pelo WhatsApp.
        </p>
      </header>

      <div aria-live="polite">
        {result.status !== 'ok' ? (
          <p
            className="wa-status"
            role={result.status === 'error' ? 'alert' : 'status'}
          >
            {STATUS_TEXT[result.status]}
          </p>
        ) : conversations.length === 0 ? (
          <p className="wa-status" role="status">
            Nenhuma mensagem ainda. Quando uma vaga for publicada para um
            paciente com WhatsApp verificado, o alerta aparece aqui.
          </p>
        ) : (
          <ul className="wa-conversations">
            {conversations.map((conversation) => (
              <li key={conversation.phone}>
                <section
                  className="wa-chat"
                  aria-label={`Conversa com ${conversation.phone}`}
                >
                  <h2 className="wa-chat-title">{conversation.phone}</h2>
                  <ol className="wa-messages">
                    {conversation.messages.map((message) => (
                      <li key={message.id} className="wa-bubble">
                        {message.kind === 'codigo_verificacao' ? (
                          <span className="wa-tag">Código de verificação</span>
                        ) : null}
                        <p className="wa-text">
                          <MessageText text={message.body} />
                        </p>
                        <time className="wa-time" dateTime={message.sentAt}>
                          {time.format(new Date(message.sentAt))}
                        </time>
                      </li>
                    ))}
                  </ol>
                </section>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
