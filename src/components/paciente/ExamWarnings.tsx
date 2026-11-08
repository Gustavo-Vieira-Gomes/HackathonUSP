import { IconAlert, IconCheck } from "@/components/icons";
import { StepHeader } from "./Screen";
import { AckFooter } from "./AckFooter";
import { ofExam } from "./helpers";
import "./avisos.css";

// Etapa «Antes de reservar» (prancha Paciente-Questionario): avisos do exame e confirmação de leitura.
// Usada no encaixe (vaga → avisos → sinal) e no horário normal (agenda → avisos → confirmar).

// Detalhe de cada aviso do catálogo. Aviso sem texto aqui usa a frase padrão.
const DETAILS: Record<string, string> = {
  "Marca-passo ou desfibrilador": "O ímã do aparelho pode desregular o dispositivo.",
  Gravidez: "Principalmente nos três primeiros meses. Avise a clínica antes.",
  "Clipe de aneurisma": "Alguns modelos de clipe no cérebro são de metal.",
  "Implante coclear": "O exame pode danificar o implante ou um neuroestimulador.",
  "Metal no corpo": "Estilhaço, projétil ou lasca de solda, principalmente nos olhos.",
  "Medo de lugar fechado": "Pode ser preciso sedação. Combine com a clínica.",
  "Alergia a contraste": "O contraste pode causar reação. Avise a clínica antes.",
  "Gravidez ou amamentação": "Avise a clínica antes. Pode ser preciso adiar o exame.",
  "Prótese de silicone": "A compressão pede cuidado extra. Avise a técnica no dia.",
};
const DEFAULT_DETAIL = "Se isso vale para você, fale com a clínica antes de pagar.";

export function ExamWarnings({
  exam,
  backHref,
  backLabel,
  nextHref,
  nextLabel,
}: {
  exam: { region_key: string; display_name: string; warnings: string[] | null; prep: string | null };
  backHref: string;
  backLabel: string;
  nextHref: string;
  nextLabel?: string;
}) {
  const warnings = exam.warnings ?? [];
  const isMri = exam.region_key.startsWith("ressonancia.");
  const reminders = ["Leve o pedido médico e um documento com foto."];
  if (isMri) reminders.push("Tire relógio, brincos e outros objetos de metal antes de entrar.");
  else if (exam.prep && exam.prep !== "Nenhum") reminders.push(exam.prep);

  return (
    <div className="vc scr-avisos" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: "20px 20px 24px", gap: 14 }}>
      <StepHeader backHref={backHref} backLabel={backLabel} step={1} total={2} />

      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, margin: "0 -4px", padding: "0 4px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          <h1 style={{ fontSize: 26 }}>Antes de reservar</h1>
          <p className="muted">
            {warnings.length > 0
              ? `Leia os avisos ${ofExam(exam.region_key, exam.display_name)}. Se algum se aplicar a você, o exame pode não ser indicado.`
              : `A clínica não cadastrou avisos para este exame. Confira os lembretes do dia do exame.`}
          </p>
        </div>

        <section aria-labelledby="t-avisos" className="panel" style={{ overflow: "hidden" }}>
          <h2 id="t-avisos" className="lbl" style={{ fontFamily: "var(--f-body), system-ui, sans-serif", letterSpacing: 0, padding: "12px 14px 4px", fontSize: 14 }}>
            {warnings.length > 0 ? "Não é recomendado para quem tem" : "Avisos do exame"}
          </h2>
          {warnings.length > 0 ? (
            <ul className="avisos">
              {warnings.map((w) => (
                <li key={w} className="aviso">
                  <IconAlert />
                  <div>
                    <strong>{w}</strong>
                    <span className="small muted">{DETAILS[w] ?? DEFAULT_DETAIL}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted" style={{ padding: "4px 14px 12px" }}>
              Este exame não tem avisos de contraindicação.
            </p>
          )}
        </section>

        <section aria-labelledby="t-lembretes" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 id="t-lembretes" className="lbl" style={{ fontFamily: "var(--f-body), system-ui, sans-serif", letterSpacing: 0, fontSize: 14 }}>
            No dia do exame
          </h2>
          <ul className="lembretes">
            {reminders.map((r) => (
              <li key={r}>
                <IconCheck />
                {r}
              </li>
            ))}
          </ul>
        </section>

        <p className="small muted">Com dúvida? Fale com a clínica ou com o seu médico antes de pagar.</p>
      </main>

      <AckFooter href={nextHref} needsAck={warnings.length > 0} label={nextLabel} />
    </div>
  );
}
