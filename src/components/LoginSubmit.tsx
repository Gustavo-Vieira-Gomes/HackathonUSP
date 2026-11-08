"use client";

import { useFormStatus } from "react-dom";

/** Botão de entrar com o estado "Entrando…" enquanto a ação roda. */
export function LoginSubmit({ label = "Entrar", className = "btn btn-primary btn-block" }: { label?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending} style={pending ? { opacity: 0.85, cursor: "progress" } : undefined}>
      {pending ? (
        <>
          <span className="login-spin" aria-hidden="true" />
          Entrando…
        </>
      ) : (
        label
      )}
    </button>
  );
}
