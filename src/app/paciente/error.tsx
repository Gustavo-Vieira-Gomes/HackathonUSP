"use client";

import { useEffect } from "react";
import Link from "next/link";

// Falha ao carregar uma tela do paciente (ex.: banco fora do ar ou sem migrations).
export default function PacienteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="vc" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: "24px 20px", gap: 14 }}>
      <span className="chip st-cancelada" style={{ alignSelf: "flex-start" }}>
        Erro
      </span>
      <h1 style={{ fontSize: 28 }}>Não deu para carregar esta tela</h1>
      <p className="muted">Pode ser a conexão ou o servidor. Tente de novo em instantes.</p>
      <div style={{ flex: 1 }} />
      <button type="button" className="btn btn-primary btn-block" onClick={() => retry()}>
        Tentar de novo
      </button>
      <Link className="btn btn-ghost btn-block" href="/paciente">
        Voltar ao início
      </Link>
    </div>
  );
}
