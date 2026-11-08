"use client";

import { useState } from "react";
import Link from "next/link";

/** Confirmação de leitura dos avisos; libera o pagamento. */
export function AckFooter({ href, needsAck, label = "Continuar para o pagamento" }: { href: string; needsAck: boolean; label?: string }) {
  const [ciente, setCiente] = useState(false);
  const ok = !needsAck || ciente;
  return (
    <>
      {needsAck && (
        <label className={ciente ? "ciente on" : "ciente"}>
          <input type="checkbox" checked={ciente} onChange={() => setCiente(!ciente)} />
          <span>Li os avisos e quero seguir com a reserva mesmo assim.</span>
        </label>
      )}
      {ok ? (
        <Link className="btn btn-primary btn-block" href={href}>
          {label}
        </Link>
      ) : (
        <button type="button" className="btn btn-block" disabled>
          {label}
        </button>
      )}
    </>
  );
}
