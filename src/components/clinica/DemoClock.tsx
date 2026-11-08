"use client";

import { useTransition } from "react";
import { advanceDemoClock, resetDemo, resetDemoClock, type ActionResult } from "@/lib/actions";
import { useToast } from "./Toast";

/** Faixa "Relógio da demo" do Painel. */
export function DemoClock({ offsetHours }: { offsetHours: number }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function run(action: () => Promise<ActionResult>, okMsg?: string) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) toast.show(res.error, "error");
      else if (okMsg) toast.show(okMsg);
    });
  }

  return (
    <section
      className="panel"
      aria-label="Relógio da demo"
      aria-busy={pending}
      style={{ padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", background: "var(--amber-s)", boxShadow: "none" }}
    >
      <div style={{ flex: "1 1 260px" }}>
        <strong>Relógio da demo</strong>
        <div className="small" style={{ color: "#17363a" }}>
          Avance o tempo e veja o preço cair em degraus. Só a conta do operador mexe nisto.
        </div>
      </div>
      <span className="num" style={{ fontSize: 26 }} aria-live="polite">
        +{offsetHours} h
      </span>
      <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => advanceDemoClock(6))}>
        Avançar 6 h
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(resetDemoClock)}>
        Zerar
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(resetDemo, "Dados da demo restaurados.")}>
        Restaurar dados da demo
      </button>
      {toast.node}
    </section>
  );
}
