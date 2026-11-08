"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { subscribeWaitlist } from "@/lib/actions";
import { IconClose } from "@/components/icons";

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const DAY_KEYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
const FULL = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const PARTS = ["Manhã", "Tarde", "Noite"];

function parseCents(text: string): number {
  const clean = text.replace(/[^\d,]/g, "").replace(",", ".");
  const value = Number(clean);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function WaitlistSheet({
  regionKey,
  side,
  examLabel,
  closeHref,
  doneHref,
}: {
  regionKey: string;
  side: string | null;
  examLabel: string;
  closeHref: string;
  doneHref: string;
}) {
  const router = useRouter();
  const [raio, setRaio] = useState(15);
  const [preco, setPreco] = useState("R$ 400");
  const [on, setOn] = useState<Record<string, boolean>>({ "0-0": true, "0-2": true, "1-4": true, "1-5": true, "2-1": true });
  const [today, setToday] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, closeHref]);

  function submit() {
    setError(null);
    const maxPriceCents = parseCents(preco);
    if (maxPriceCents <= 0) {
      setError("Informe um preço máximo.");
      return;
    }
    const weekdays = DAY_KEYS.filter((_, ci) => PARTS.some((__, ri) => on[`${ri}-${ci}`]));
    if (weekdays.length === 0) {
      setError("Marque pelo menos um dia e horário em que você pode ir.");
      return;
    }
    startTransition(async () => {
      const res = await subscribeWaitlist({ regionKey, side, examLabel, radiusKm: raio, maxPriceCents, weekdays, canGoToday: today });
      if (res.ok) router.push(doneHref);
      else setError(res.error);
    });
  }

  return (
    <div className="vc scr-aviso" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      {/* tela de trás, escurecida */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, padding: "22px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 30 }}>Marcar exame</h1>
        <div style={{ height: 76, borderRadius: 14, background: "#fff" }} />
        <div style={{ height: 72, borderRadius: 14, background: "var(--ink)" }} />
        <div style={{ height: 300, borderRadius: 14, background: "#fff" }} />
      </div>
      <Link href={closeHref} aria-label="Fechar" tabIndex={-1} style={{ position: "absolute", inset: 0, background: "rgba(23,54,58,.62)" }} />

      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="st"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "100%",
          overflowY: "auto",
          background: "#fff",
          borderRadius: "26px 26px 0 0",
          padding: "10px 20px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 -12px 40px rgba(23,54,58,.25)",
        }}
      >
        <div style={{ width: 44, height: 5, borderRadius: 3, background: "#b3d1ca", alignSelf: "center", flex: "none" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 id="st" ref={titleRef} tabIndex={-1} style={{ fontSize: 24, outline: "none" }}>
              Avise-me quando surgir vaga
            </h2>
            <p className="muted" style={{ marginTop: 4 }}>
              {examLabel}
            </p>
          </div>
          <Link href={closeHref} aria-label="Fechar" className="btn btn-ghost btn-sm" style={{ width: 44, padding: 0, flex: "none" }}>
            <IconClose />
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
          <div className="field">
            <label htmlFor="rk">
              Distância:{" "}
              <span className="num" style={{ fontSize: 16 }}>
                {raio} km
              </span>
            </label>
            <input id="rk" type="range" min={2} max={30} value={raio} onChange={(e) => setRaio(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="pm">Preço máximo</label>
            <input id="pm" className="input" inputMode="numeric" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </div>
        </div>

        <div role="group" aria-label="Quando você pode ir" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="lbl">Quando você pode ir</span>
          <div style={{ display: "grid", gridTemplateColumns: "52px repeat(7, minmax(0,1fr))", gap: 4, alignItems: "center" }}>
            <span />
            {DAYS.map((d) => (
              <span key={d} className="small muted" style={{ textAlign: "center", fontWeight: 600 }}>
                {d}
              </span>
            ))}
          </div>
          {PARTS.map((name, ri) => (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "52px repeat(7, minmax(0,1fr))", gap: 4, alignItems: "center" }}>
              <span className="small" style={{ fontWeight: 600 }}>
                {name}
              </span>
              {DAYS.map((d, ci) => {
                const key = `${ri}-${ci}`;
                const isOn = !!on[key];
                return (
                  <button
                    key={d}
                    type="button"
                    className={isOn ? "cell on" : "cell"}
                    aria-pressed={isOn}
                    aria-label={`${name} de ${FULL[ci]}`}
                    onClick={() => setOn({ ...on, [key]: !isOn })}
                  >
                    {isOn ? "✓" : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <label className="panel" style={{ display: "flex", gap: 12, padding: "10px 14px", alignItems: "center", cursor: "pointer", minHeight: 52 }}>
          <input type="checkbox" checked={today} onChange={() => setToday(!today)} style={{ width: 22, height: 22, accentColor: "#2a7f75", flex: "none", margin: 0 }} />
          <span>
            <strong>Posso ir hoje</strong>
            <span className="small muted" style={{ display: "block" }}>
              Mostrar vagas que abrem agora perto de mim.
            </span>
          </span>
        </label>

        {error && (
          <p className="help err" role="alert">
            {error}
          </p>
        )}

        <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={pending} aria-busy={pending}>
          {pending ? "Criando aviso…" : "Avisar quando surgir vaga"}
        </button>
        <p className="small muted" style={{ textAlign: "center" }}>
          O aviso vale por 30 dias. Você pode cancelar quando quiser.
        </p>
      </div>
    </div>
  );
}
