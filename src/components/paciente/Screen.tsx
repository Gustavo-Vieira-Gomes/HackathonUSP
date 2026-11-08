import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { IconChevronLeft } from "@/components/icons";

// Raiz de cada tela do app do paciente: ocupa a moldura de 390 × 844 e rola por dentro, como nas pranchas.
const ROOT: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" };

export function Screen({
  children,
  style,
  header,
  footer,
  label,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  /** Cabeçalho fixo acima da área que rola (ex.: barra com a logo no Início). */
  header?: ReactNode;
  footer?: ReactNode;
  label?: string;
  /** Classe da tela, usada para escopar o CSS da prancha (ex.: "scr-exames"). */
  className?: string;
}) {
  return (
    <div className={className ? `vc ${className}` : "vc"} style={ROOT}>
      {header}
      <main aria-label={label} style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", ...style }}>
        {children}
      </main>
      {footer}
    </div>
  );
}

/** Tela de espera enquanto os dados chegam (fallback do Suspense). */
export function ScreenLoading() {
  return (
    <div className="vc" style={ROOT} aria-busy="true">
      <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <span className="sr-only">Carregando…</span>
        <div style={{ height: 30, width: "55%", borderRadius: 10, background: "#e4f1ee" }} />
        <div style={{ height: 120, borderRadius: 22, background: "#fff", boxShadow: "inset 0 0 0 1px var(--line)" }} />
        <div style={{ height: 76, borderRadius: 14, background: "#e4f1ee" }} />
        <div style={{ height: 76, borderRadius: 14, background: "#e4f1ee" }} />
      </div>
    </div>
  );
}

/** Botão quadrado de voltar (44 × 44), do topo das pranchas. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} className="btn btn-ghost btn-sm" style={{ width: 44, padding: 0, flex: "none" }}>
      <IconChevronLeft />
    </Link>
  );
}

/** Barra de progresso "Passo N de 2" do fluxo de encaixe. */
export function StepHeader({ backHref, backLabel, step, total }: { backHref: string; backLabel: string; step: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <BackLink href={backHref} label={backLabel} />
      <div style={{ flex: 1 }}>
        <div className="small muted">
          Passo {step} de {total}
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "#e4f1ee", marginTop: 4 }}>
          <div style={{ width: `${Math.round((step / total) * 100)}%`, height: "100%", borderRadius: 3, background: "var(--teal)" }} />
        </div>
      </div>
    </div>
  );
}
