"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { IconAgenda, IconAlert, IconDashboard, IconFlask, IconLogout, IconPencil, IconUser, Wordmark } from "./icons";
import { logoutClinic } from "@/lib/actions";

const ITEMS = [
  { href: "/clinica", label: "Painel", icon: IconDashboard, match: (p: string) => p === "/clinica" },
  { href: "/clinica/agenda", label: "Agenda", icon: IconAgenda, match: (p: string) => p.startsWith("/clinica/agenda") },
  { href: "/clinica/exames", label: "Exames", icon: IconFlask, match: (p: string) => p.startsWith("/clinica/exames") },
];

export type ClinicProfile = {
  name: string;
  address: string;
  openingHours: string;
  google: { connected: boolean; email: string | null };
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((w) => w.length > 2);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Barra escura da clínica: logo e navegação à esquerda, perfil à direita com o card da clínica. */
export function ClinicNav({ clinic }: { clinic: ClinicProfile }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(path);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const cardId = useId();

  // Fecha ao trocar de tela.
  if (open && openedAt !== path) {
    setOpen(false);
    setOpenedAt(path);
  }

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

  function toggle() {
    setOpenedAt(path);
    setOpen((v) => !v);
  }

  return (
    <aside className="cl-header">
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", textDecoration: "none", color: "#fff" }}>
        <Wordmark height={28} tone="onDark" />
      </Link>
      <nav className="nav" aria-label="Clínica" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const on = match(path);
          return (
            <Link key={href} href={href} className={on ? "on" : undefined} aria-current={on && path === href ? "page" : undefined}>
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>
      <div style={{ flex: 1 }} />

      <div className="cl-profile" ref={wrap}>
        <button
          ref={button}
          type="button"
          className={open ? "cl-avatar on" : "cl-avatar"}
          aria-label="Perfil da clínica"
          aria-expanded={open}
          aria-controls={cardId}
          onClick={toggle}
        >
          <IconUser />
        </button>

        {open && (
          <div id={cardId} className="cl-card card" role="dialog" aria-label="Perfil da clínica">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span className="cl-initials" aria-hidden="true">
                {initials(clinic.name)}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <strong style={{ fontSize: 19, lineHeight: 1.25 }}>{clinic.name}</strong>
                <span className="small muted">Clínica parceira</span>
              </div>
            </div>

            <hr className="hr" />

            <div className="row">
              <span className="k">Endereço</span>
              <span className="v">{clinic.address}</span>
            </div>
            <div className="row">
              <span className="k">Horário</span>
              <span className="v">{clinic.openingHours}</span>
            </div>

            {clinic.google.connected ? (
              <div className="cl-cal">
                <span className="cl-cal-g" aria-hidden="true">G</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <strong style={{ fontSize: 15 }}>Google Agenda conectada</strong>
                  <span className="small muted" style={{ overflowWrap: "anywhere" }}>{clinic.google.email ?? "conta conectada"}</span>
                </div>
                <span className="cl-cal-ok" aria-hidden="true" />
              </div>
            ) : (
              <div className="cl-cal warn" role="note">
                <IconAlert style={{ color: "var(--red)", flex: "none", marginTop: 1 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <strong style={{ fontSize: 15 }}>Nenhuma agenda conectada</strong>
                  <span className="small" style={{ color: "var(--ink-2)" }}>
                    Conecte a agenda da clínica para os cancelamentos virarem vagas sozinhos.
                  </span>
                  <Link href="/clinica/agenda?conectar=1" className="cl-cal-link">
                    Conectar agenda
                  </Link>
                </div>
              </div>
            )}

            <div className="cl-actions">
              <Link href="/clinica/perfil" className="btn btn-ghost btn-sm">
                <IconPencil />
                Editar informações
              </Link>
              <form action={logoutClinic}>
                <button type="submit" className="btn btn-ghost btn-sm">
                  <IconLogout />
                  Sair
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
