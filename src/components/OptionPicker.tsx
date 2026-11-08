import { IconChevronRight } from "./icons";
import { TypeIcon } from "./TypeIcon";

export type PickOption = {
  key: string;
  label: string;
  /** Linha de apoio abaixo do rótulo, ex.: "sem contraste". */
  hint?: string;
  /** Etiqueta à direita, ex.: "Mais comum". */
  tag?: string;
  /** Chave do tipo de exame para o ícone (ressonancia, tomografia...). */
  icon?: string;
};

/**
 * Padrão de botão de escolha do remark (paciente e clínica).
 * - Lista de uma coluna quando há ícone, detalhe, etiqueta ou rótulo longo.
 * - Grade de duas colunas, de altura uniforme, para opções curtas.
 * `wide`: em telas largas (painel da clínica), a lista se divide em colunas.
 */
export function OptionPicker({ options, onPick, wide = false }: { options: PickOption[]; onPick: (key: string) => void; wide?: boolean }) {
  const list = options.some((o) => o.icon || o.hint || o.tag || o.label.length > 16);
  if (!list) {
    return (
      <div className={wide ? "pick-grid wide" : "pick-grid"}>
        {options.map((o) => (
          <button key={o.key} type="button" className="pick-cell" onClick={() => onPick(o.key)}>
            <span>{o.label}</span>
            <IconChevronRight />
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={wide ? "pick-list wide" : "pick-list"}>
      {options.map((o) => (
        <button key={o.key} type="button" className="pick-row" onClick={() => onPick(o.key)}>
          {o.icon ? (
            <span className="pick-ico">
              <TypeIcon type={o.icon} />
            </span>
          ) : null}
          <span className="pick-text">
            <strong>{o.label}</strong>
            {o.hint ? <span className="small muted">{o.hint}</span> : null}
          </span>
          {o.tag ? (
            <span className="chip st-publicada" style={{ minHeight: 24, fontSize: 12, flex: "none" }}>
              {o.tag}
            </span>
          ) : null}
          <IconChevronRight />
        </button>
      ))}
    </div>
  );
}
