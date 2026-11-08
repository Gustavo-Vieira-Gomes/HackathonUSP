"use client";

import { useEffect, useState } from "react";

/** "há 38 segundos": tempo desde que a página leu a agenda. */
export function SyncedAgo({ prefix = "Agenda sincronizada" }: { prefix?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  let ago: string;
  if (seconds < 2) ago = "agora mesmo";
  else if (seconds < 60) ago = `há ${seconds} segundos`;
  else {
    const min = Math.floor(seconds / 60);
    ago = `há ${min} ${min === 1 ? "minuto" : "minutos"}`;
  }
  return (
    <>
      {prefix} {ago}
    </>
  );
}
