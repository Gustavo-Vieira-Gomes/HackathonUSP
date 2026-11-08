"use client";

import { useEffect, useId, useRef, useState } from "react";
import { logoutPatient } from "@/lib/actions";
import { IconLogout, IconUser, Wordmark } from "@/components/icons";

type Patient = { name: string; email: string | null; phone: string | null };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Cabeçalho do Início do paciente: logo à esquerda, perfil à direita com o card de conta. */
export function PatientHeader({ patient }: { patient: Patient | null }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const cardId = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = patient?.name ?? "Paciente";

  return (
    <header className="pt-header" ref={wrap}>
      <Wordmark height={28} tone="onDark" />
      <button
        ref={button}
        type="button"
        className={open ? "pt-avatar on" : "pt-avatar"}
        aria-label="Meu perfil"
        aria-expanded={open}
        aria-controls={cardId}
        onClick={() => setOpen((v) => !v)}
      >
        <IconUser />
      </button>

      {open && (
        <div id={cardId} className="pt-card card" role="dialog" aria-label="Meu perfil">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="pt-initials" aria-hidden="true">
              {initials(name)}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <strong style={{ fontSize: 17, lineHeight: 1.25 }}>{name}</strong>
              <span className="small muted">Paciente</span>
            </div>
          </div>
          <hr className="hr" />
          <div className="row">
            <span className="k">E-mail</span>
            <span className="v" style={{ overflowWrap: "anywhere" }}>{patient?.email ?? "Não informado"}</span>
          </div>
          <div className="row">
            <span className="k">Celular</span>
            <span className="v">{patient?.phone ?? "Não informado"}</span>
          </div>
          <form action={logoutPatient}>
            <button type="submit" className="btn btn-ghost btn-block btn-sm">
              <IconLogout />
              Sair
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
