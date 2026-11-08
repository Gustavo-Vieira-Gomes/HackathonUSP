"use client";

import { useState, type ReactNode } from "react";

/** Seletor Próximas/Anteriores da prancha «Minhas reservas»; as listas vêm prontas do servidor. */
export function ReservasTabs({
  nProx,
  nAnt,
  proximas,
  anteriores,
  initial = "proximas",
}: {
  nProx: number;
  nAnt: number;
  proximas: ReactNode;
  anteriores: ReactNode;
  initial?: "proximas" | "anteriores";
}) {
  const [aba, setAba] = useState(initial);
  const prox = aba === "proximas";
  return (
    <>
      <div role="group" aria-label="Quais reservas mostrar" className="seg">
        <button type="button" className={prox ? "on" : ""} aria-pressed={prox} onClick={() => setAba("proximas")}>
          Próximas <span className="seg-n">{nProx}</span>
        </button>
        <button type="button" className={prox ? "" : "on"} aria-pressed={!prox} onClick={() => setAba("anteriores")}>
          Anteriores <span className="seg-n">{nAnt}</span>
        </button>
      </div>
      {prox ? proximas : anteriores}
    </>
  );
}
