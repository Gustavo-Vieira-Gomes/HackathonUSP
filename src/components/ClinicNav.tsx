"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconAgenda, IconDashboard, IconFlask, Wordmark } from "./icons";
import { logoutClinic } from "@/lib/actions";

const ITEMS = [
  { href: "/clinica", label: "Painel", icon: IconDashboard, match: (p: string) => p === "/clinica" },
  { href: "/clinica/agenda", label: "Agenda", icon: IconAgenda, match: (p: string) => p.startsWith("/clinica/agenda") },
  { href: "/clinica/exames", label: "Exames", icon: IconFlask, match: (p: string) => p.startsWith("/clinica/exames") },
];

export function ClinicNav({ clinicName, connectedLabel }: { clinicName: string; connectedLabel: string }) {
  const path = usePathname();
  return (
    <aside
      style={{
        background: "var(--ink)",
        color: "#fff",
        padding: "10px max(16px, min(36px, 3vw))",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px 32px",
      }}
    >
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
      <div style={{ padding: "8px 14px", borderRadius: 12, background: "rgba(255,255,255,.08)" }} className="small">
        <strong>{clinicName}</strong>
        <span style={{ color: "#c9e6e0" }}> · {connectedLabel}</span>
      </div>
      <form action={logoutClinic}>
        <button
          type="submit"
          className="btn btn-sm"
          style={{ background: "transparent", color: "#c9e6e0", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.28)" }}
        >
          Sair
        </button>
      </form>
    </aside>
  );
}
