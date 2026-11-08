"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CATALOG, examName, patientSideOptions, sideSummary, type ExamType, type PatientSide, type Region } from "@/lib/catalog";
import { IconChevronRight } from "@/components/icons";
import { examsHref } from "./helpers";

// Árvore de escolha montada do catálogo único: tipo → região → lado, como no pedido médico.
type Leaf = { regionKey: string; side: PatientSide | null; name: string; summary: string | null; checkExtent: boolean };
type Node = { label: string; crumb?: string; hint?: string; tag?: string; icon?: string; q?: string; children?: Node[]; leaf?: Leaf };

function leaf(region: Region, side: PatientSide | null): Leaf {
  return {
    regionKey: region.key,
    side,
    name: examName(region.key, side),
    summary: sideSummary(region.key, side),
    checkExtent: !!region.checkExtent,
  };
}

function regionNode(region: Region, label = region.label, hint?: string): Node {
  if (!region.sides) return { label, hint, leaf: leaf(region, null) };
  const sideLeaves = patientSideOptions(region).map((o) => ({ label: o.label, hint: o.hint, leaf: leaf(region, o.side) }));
  if (region.sides.kind === "mama") {
    // Mamografia: a bilateral é a oferta padrão; o resto fica atrás de «Meu pedido indica algo diferente».
    return {
      label,
      hint,
      q: region.sides.question,
      children: [
        { label: "Mamografia bilateral - duas mamas", tag: "Mais comum", leaf: leaf(region, "ambos") },
        { label: "Meu pedido indica algo diferente", crumb: "Pedido diferente", q: "Qual mama o pedido indica?", children: sideLeaves },
      ],
    };
  }
  return { label, hint, q: region.sides.question, children: sideLeaves };
}

function typeNode(type: ExamType): Node {
  // Tipos sem pergunta de região (mamografia, ecocardiograma) vão direto ao lado ou ao fim.
  if (!type.question && type.regions.length === 1) return { ...regionNode(type.regions[0], type.fullLabel, type.note), crumb: type.label, icon: type.key };
  return { label: type.fullLabel, crumb: type.label, hint: type.note, icon: type.key, q: type.question ?? "Qual região?", children: type.regions.map((r) => regionNode(r)) };
}

/** Ícone de traço por tipo de exame. */
function TypeIcon({ type }: { type: string }) {
  const paths: Record<string, ReactNode> = {
    ressonancia: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="6" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    tomografia: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 4v4" />
      </>
    ),
    ultrassom: (
      <>
        <path d="M6 9a7 7 0 0 1 12 0" />
        <path d="M8.5 12a4 4 0 0 1 7 0" />
        <path d="M12 15v5" />
      </>
    ),
    mamografia: (
      <>
        <path d="M4 15a5 5 0 0 0 8 0 5 5 0 0 0 8 0" />
        <circle cx="8" cy="14" r="0.8" />
        <circle cx="16" cy="14" r="0.8" />
      </>
    ),
    ecocardiograma: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM7 12h3l1.5-2.5L13 14l1.5-2H17" />,
  };
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 22, height: 22 }}>
      {paths[type] ?? <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}

const TREE: Node = { label: "", q: "Qual tipo de exame?", children: CATALOG.map(typeNode) };

export function ExamPicker() {
  const [path, setPath] = useState<number[]>([]);

  let cur = TREE;
  const crumbs: { label: string; level: number }[] = [];
  path.forEach((idx, level) => {
    cur = cur.children![idx];
    crumbs.push({ label: cur.crumb ?? cur.label, level });
  });
  const asking = !!cur.children;
  // Lista de uma coluna quando há ícone, detalhe ou rótulo longo; senão, grade de duas colunas.
  const list = asking && cur.children!.some((o) => o.icon || o.hint || o.tag || o.label.length > 16);

  return (
    <section className="card pick" aria-label="Escolher exame">
      <h2 style={{ fontSize: 22 }}>Qual exame você precisa?</h2>

      {crumbs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px", alignItems: "center" }}>
          {crumbs.map((c, i) => (
            <span key={c.level} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button type="button" className="crumb" aria-label={`Trocar ${c.label}`} onClick={() => setPath(path.slice(0, c.level))}>
                {c.label}
              </button>
              {i < crumbs.length - 1 && (
                <span className="muted" aria-hidden="true">
                  ›
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {asking ? (
        <div className="opts" key={path.join("-")} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="lbl" style={{ fontSize: 15 }}>{cur.q}</p>
          {cur.children!.some((o) => o.leaf?.side) ? (
            <p className="small muted" style={{ marginTop: -4 }}>
              Responda conforme o pedido médico.
            </p>
          ) : null}
          {list ? (
            <div className="pick-list">
              {cur.children!.map((o, i) => (
                <button key={o.label} type="button" className="pick-row" onClick={() => setPath([...path, i])}>
                  {o.icon ? (
                    <span className="pick-ico">
                      <TypeIcon type={o.icon} />
                    </span>
                  ) : null}
                  <span className="pick-text">
                    <strong>{o.label}</strong>
                    {o.hint ? <span className="small muted">{o.hint}</span> : null}
                  </span>
                  {o.tag ? (
                    <span className="chip st-publicada" style={{ minHeight: 24, fontSize: 12, flex: "none" }}>
                      {o.tag}
                    </span>
                  ) : null}
                  <IconChevronRight />
                </button>
              ))}
            </div>
          ) : (
            <div className="pick-grid">
              {cur.children!.map((o, i) => (
                <button key={o.label} type="button" className="choice" onClick={() => setPath([...path, i])}>
                  <span>{o.label}</span>
                  <IconChevronRight />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="opts" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "var(--mint)", borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="small muted">Você vai buscar</span>
            <div className="disp" style={{ fontSize: 22 }}>
              {cur.leaf!.name}
            </div>
            {cur.leaf!.summary ? (
              <span className="small" style={{ fontWeight: 600, color: "var(--teal-d)" }}>
                {cur.leaf!.summary}
              </span>
            ) : null}
            {cur.leaf!.side === "conferir" ? (
              <span className="small" style={{ color: "var(--ink-2)" }}>
                Mostramos as ofertas de um lado e as bilaterais. A clínica confere o pedido antes do exame.
              </span>
            ) : null}
            {cur.leaf!.checkExtent ? (
              <span className="small" style={{ color: "var(--ink-2)" }}>
                A clínica confere a extensão exata com o seu pedido antes da reserva definitiva.
              </span>
            ) : null}
          </div>
          <Link className="btn btn-primary btn-block" href={examsHref(cur.leaf!)}>
            Ver horários e preços
          </Link>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setPath([])}>
            Escolher outro exame
          </button>
        </div>
      )}
    </section>
  );
}
