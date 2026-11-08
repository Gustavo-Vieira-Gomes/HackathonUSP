"use client";

import { useState, useTransition } from "react";
import { reserveVacancy } from "@/lib/actions";
import { StepHeader } from "@/components/paciente/Screen";
import { Countdown } from "@/components/paciente/Countdown";
import { PaymentLoading } from "@/components/paciente/PaymentLoading";

export function PaymentForm({
  vacancyId,
  offerExamId,
  backHref,
  side,
  examLabel,
  summary,
  pct,
  deposit,
  price,
  rest,
  pix,
}: {
  vacancyId: string;
  offerExamId: string | null;
  backHref: string;
  side: string | null;
  examLabel: string;
  summary: string | null;
  pct: number;
  deposit: string;
  price: string;
  rest: string;
  pix: string;
}) {
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isPix = method === "pix";

  function pay() {
    setError(null);
    startTransition(async () => {
      const res = await reserveVacancy(vacancyId, method, offerExamId, side);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="vc scr-pagamento" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {pending && <PaymentLoading />}
      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", padding: "20px 20px 24px", gap: 14 }}>
        <StepHeader backHref={backHref} backLabel="Voltar ao questionário" step={2} total={2} />

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          <h1 style={{ fontSize: 30 }}>Pague o sinal</h1>
          <p className="muted">Pagou, a vaga é sua. Outra pessoa não consegue mais pegar.</p>
        </div>

        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <strong>{examLabel}</strong>
            {summary ? <span className="small" style={{ fontWeight: 600, color: "var(--teal-d)" }}>{summary}</span> : null}
          </div>
          <hr className="hr" />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="muted">Sinal de {pct}%</span>
            <span className="num" style={{ fontSize: 40 }}>
              {deposit}
            </span>
          </div>
          <hr className="hr" />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="muted">Exame hoje</span>
            <span className="num" style={{ fontSize: 17 }}>
              {price}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="muted">Você paga na clínica</span>
            <span className="num" style={{ fontSize: 17 }}>
              {rest}
            </span>
          </div>
        </div>

        <div style={{ background: "var(--amber-s)", borderRadius: 14, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="small" style={{ color: "#17363a", fontWeight: 600 }}>
            Tempo para pagar
          </span>
          <Countdown style={{ fontSize: 20, color: "#17363a" }} />
        </div>

        <div role="group" aria-label="Forma de pagamento" style={{ display: "flex", gap: 4, padding: 4, background: "#e4f1ee", borderRadius: 15 }}>
          <button type="button" className={isPix ? "seg on" : "seg"} aria-pressed={isPix} onClick={() => setMethod("pix")}>
            Pix
          </button>
          <button type="button" className={isPix ? "seg" : "seg on"} aria-pressed={!isPix} onClick={() => setMethod("card")}>
            Cartão
          </button>
        </div>

        {isPix ? (
          <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="lbl">Pix copia e cola</span>
            <div style={{ font: "500 13px ui-monospace, monospace", wordBreak: "break-all", color: "var(--ink-2)", background: "var(--ground)", padding: 10, borderRadius: 10 }}>{pix}</div>
            <span className="small muted">Pagamento simulado nesta versão.</span>
          </div>
        ) : (
          <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="field">
              <label htmlFor="cn">Número do cartão</label>
              <input id="cn" className="input" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10 }}>
              <div className="field">
                <label htmlFor="cv">Validade</label>
                <input id="cv" className="input" autoComplete="cc-exp" placeholder="MM/AA" />
              </div>
              <div className="field">
                <label htmlFor="cc">Código</label>
                <input id="cc" className="input" inputMode="numeric" autoComplete="cc-csc" placeholder="000" />
              </div>
            </div>
          </div>
        )}

        <p className="small muted" style={{ padding: "0 4px" }}>
          Se a clínica cancelar, devolvemos o sinal inteiro. Se você faltar ou cancelar, a clínica fica com ele.
        </p>

        {error && (
          <p className="help err" role="alert" style={{ padding: "0 4px" }}>
            {error}
          </p>
        )}

        <div style={{ flex: 1 }} />

        <button type="button" className="btn btn-amber btn-block" onClick={pay} disabled={pending} aria-busy={pending}>
          {pending ? "Pagando…" : `Pagar ${deposit}`}
        </button>
      </main>
    </div>
  );
}
