"use client";

import { useEffect, useState } from "react";

/** Contagem regressiva visual (padrão 10 minutos), em mm:ss. Para em 00:00. */
export function Countdown({ seconds = 600, className = "num", style }: { seconds?: number; className?: string; style?: React.CSSProperties }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <span className={className} style={style} role="timer" aria-label={`${Math.floor(left / 60)} minutos e ${left % 60} segundos`}>
      {mm}:{ss}
    </span>
  );
}
