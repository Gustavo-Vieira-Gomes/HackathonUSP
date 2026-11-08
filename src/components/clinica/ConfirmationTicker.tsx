"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Roda o ciclo de confirmação pelo WhatsApp a cada minuto enquanto o painel está aberto. */
export function ConfirmationTicker() {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch("/api/whatsapp/tick", { method: "POST" });
        const data = (await res.json()) as { sent?: number; expired?: number };
        if (alive && (data.sent || data.expired)) router.refresh();
      } catch {
        // Sem rede ou servidor reiniciando: tenta de novo no próximo minuto.
      }
    }
    void tick();
    const id = window.setInterval(tick, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [router]);
  return null;
}
