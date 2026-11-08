"use client";

import { useState, useTransition } from "react";
import { reserveNormal } from "@/lib/actions";
import { PaymentLoading } from "@/components/paciente/PaymentLoading";

const METHODS = [
  { id: "pix", label: "Pix", hint: "Pague agora pelo app" },
  { id: "card", label: "Cartão", hint: "Pague agora pelo app" },
] as const;

export function ConfirmNormal({ examId, startsAt, depositLabel, pct, past, side }: { examId: string; startsAt: string; depositLabel: string; pct: number; past: boolean; side: string | null }) {
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [error, setError] = useState<string | null>(past ? "Este horário já passou. Volte e escolha outro." : null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await reserveNormal(examId, startsAt, method, side);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <>
      {pending && <PaymentLoading title="Confirmando a reserva" />}
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <legend className="lbl" style={{ padding: "0 0 8px" }}>
          Como você quer pagar o sinal?
        </legend>
        {METHODS.map((d) => {
          const on = method === d.id;
          return (
            <label key={d.id} className={on ? "pay on" : "pay"}>
              <input type="radio" name="pg" checked={on} onChange={() => setMethod(d.id)} />
              <span>
                {d.label}
                <span className="small muted" style={{ display: "block", fontWeight: 400 }}>
                  {d.hint}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <p className="small muted" style={{ padding: "0 4px" }}>
        Sinal agora: <strong style={{ color: "var(--ink)" }}>{depositLabel}</strong> ({pct}%). O restante você paga na clínica.
        <br />
        Você cancela sem custo até 24 horas antes do horário.
      </p>

      {error && (
        <p className="help err" role="alert" style={{ padding: "0 4px" }}>
          {error}
        </p>
      )}

      <div style={{ flex: 1 }} />

      <button type="button" className="btn btn-primary btn-block" onClick={confirm} disabled={pending || past} aria-busy={pending}>
        {pending ? "Confirmando…" : "Confirmar reserva"}
      </button>
    </>
  );
}
