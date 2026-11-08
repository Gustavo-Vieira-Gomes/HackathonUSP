/** Divide em links e texto; o grupo de captura mantém os links no resultado. */
const URL_SPLIT = /(https?:\/\/\S+)/;
const IS_URL = /^https?:\/\/\S+$/;
const BOLD = /^\*(.+)\*$/;

/**
 * Texto de uma mensagem como o WhatsApp mostraria: quebras de linha, links
 * clicáveis e `*negrito*` numa linha inteira. Sem HTML vindo da API: tudo é texto.
 */
export function MessageText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => {
        const bold = BOLD.exec(line);
        const content = bold?.[1] ?? line;
        const parts = content.split(URL_SPLIT).map((part, i) =>
          IS_URL.test(part) ? (
            <a key={i} href={part} rel="noreferrer">
              {part}
            </a>
          ) : (
            part
          ),
        );
        return (
          <span key={index} className="wa-line">
            {bold ? <strong>{parts}</strong> : parts}
          </span>
        );
      })}
    </>
  );
}
