"use client";

import { useState, useTransition, type FormEvent } from "react";
import { publishCancellation } from "@/lib/actions";
import { brl } from "@/lib/format";
import { Dialog, DialogHeader } from "./Dialog";
import { useToast } from "./Toast";
import { discountPct, leftLabel, priceStep, vacancyPriceCents } from "./pricing";

/** "A, B e C". */
function listaPt(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

export type UpcomingAppointment = {
  id: string;
  quando: string;
  paciente: string;
  exame: string;
  sala: string;
  startsAt: string;
  fullCents: number;
  floorCents: number;
  /** Exames que também podem ocupar este horário (substitutos ativos). */
  substitutos: string[];
};

/** Botão "Publicar cancelamento" do Painel e o diálogo da prancha. */
export function PublishCancellation({ appointments, nowIso }: { appointments: UpcomingAppointment[]; nowIso: string }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const now = Date.parse(nowIso);
  const agenda = appointments.filter((a) => Date.parse(a.startsAt) > now);
  const chosen = agenda.find((a) => a.id === sel) ?? null;

  let preview: { quando: string; preco: string; nota: string } | null = null;
  if (chosen) {
    const left = (Date.parse(chosen.startsAt) - now) / 3600_000;
    const price = vacancyPriceCents(chosen.fullCents, chosen.floorCents, left);
    const pct = discountPct(chosen.fullCents, price);
    preview = {
      quando: `${chosen.quando}, ${chosen.exame}`,
      preco: brl(price),
      nota: priceStep(left) === 0 || pct === 0 ? "preço cheio por enquanto" : `−${pct}% agora, faltam ${leftLabel(left)}`,
    };
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setError("");
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chosen) return;
    const picked = chosen;
    setError("");
    startTransition(async () => {
      const res = await publishCancellation(picked.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setSel(null);
      toast.show(`${picked.quando} publicado como encaixe. Fila avisada.`);
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setSel(null);
          setError("");
          setOpen(true);
        }}
      >
        <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16M9 3v4M15 3v4M10 13l4 4M14 13l-4 4" />
        </svg>
        Publicar cancelamento
      </button>

      {open ? (
        <Dialog labelledBy="t-cancel" onClose={close} onSubmit={submit} width={600} paddingTop={80}>
          <DialogHeader id="t-cancel" title="Publicar cancelamento" onClose={close}>
            Escolha o agendamento que foi cancelado. Ele sai da agenda e o horário vira vaga de encaixe no remark, com aviso aos pacientes da fila.
          </DialogHeader>

          <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <legend className="lbl" style={{ padding: "0 0 8px" }}>
              Próximos agendamentos
            </legend>
            {agenda.map((a, i) => {
              const on = sel === a.id;
              return (
                <label key={a.id} className={on ? "ag on" : "ag"}>
                  <input type="radio" name="ag" checked={on} onChange={() => setSel(a.id)} data-autofocus={i === 0 ? true : undefined} />
                  <span className="hr-t">{a.quando}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: "block" }}>{a.paciente}</strong>
                    <span className="small muted">
                      {a.exame} · {a.sala}
                    </span>
                  </span>
                  <span className="small muted">{brl(a.fullCents)}</span>
                </label>
              );
            })}
            {agenda.length === 0 ? <p className="small muted">Nenhum agendamento futuro na agenda.</p> : null}
          </fieldset>

          {preview ? (
            <>
              <div
                className="panel"
                style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: "10px 18px", alignItems: "center", background: "var(--amber-s)", boxShadow: "none" }}
              >
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <strong>Vai ao ar como encaixe</strong>
                  <div className="small" style={{ color: "var(--ink-2)" }}>
                    {preview.quando} · {preview.nota}
                  </div>
                </div>
                <span className="num" style={{ fontSize: 30 }}>
                  {preview.preco}
                </span>
              </div>
              {chosen && chosen.substitutos.length > 0 ? (
                <p className="small" style={{ color: "var(--ink-2)" }}>
                  <strong>Também vale para:</strong> {listaPt(chosen.substitutos)}. Cada exame aparece pelo preço dele.
                </p>
              ) : null}
              <p className="small muted">O preço desce em degraus até o piso conforme o horário se aproxima. O paciente cancelado deixa de ver o horário no app.</p>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="help err">
              {error}
            </p>
          ) : null}

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
              Cancelar
            </button>
            {chosen ? (
              <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
                {pending ? "Publicando…" : "Cancelar agendamento e publicar vaga"}
              </button>
            ) : (
              <button type="button" className="btn btn-sm" disabled>
                Escolha um agendamento
              </button>
            )}
          </div>
        </Dialog>
      ) : null}

      {toast.node}
    </>
  );
}
