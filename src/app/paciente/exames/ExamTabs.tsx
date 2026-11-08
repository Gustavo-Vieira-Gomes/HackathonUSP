"use client";

import { useState, type ReactNode } from "react";

type Tab = "encaixe" | "normal";

/** Seletor Encaixe / Horário normal. Troca na hora e guarda a aba na URL (`?aba=normal`). */
export function ExamTabs({
  examBar,
  initial,
  nEnc,
  nNor,
  encaixe,
  normal,
}: {
  examBar: ReactNode;
  initial: Tab;
  nEnc: number;
  nNor: number;
  encaixe: ReactNode;
  normal: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(initial);

  function choose(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "normal") url.searchParams.set("aba", "normal");
    else url.searchParams.delete("aba");
    url.searchParams.delete("aviso");
    window.history.replaceState(null, "", url);
  }

  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {examBar}
        <div role="group" aria-label="Tipo de horário" className="seg">
          <button type="button" className={tab === "encaixe" ? "on" : ""} aria-pressed={tab === "encaixe"} onClick={() => choose("encaixe")}>
            Encaixe <span className="seg-n">{nEnc}</span>
          </button>
          <button type="button" className={tab === "normal" ? "on" : ""} aria-pressed={tab === "normal"} onClick={() => choose("normal")}>
            Horário normal <span className="seg-n">{nNor}</span>
          </button>
        </div>
      </header>
      {/* As duas listas chegam prontas do servidor; a aba só escolhe qual mostrar. */}
      {tab === "encaixe" ? encaixe : normal}
    </>
  );
}
