"use client";

import Link from "next/link";
import { useState } from "react";
import { brl } from "@/lib/format";
import { IconPencil } from "@/components/icons";

export type ExamRow = {
  id: string;
  nome: string;
  tipo: string;
  tuss: string | null;
  sala: string;
  cheioCents: number;
  pisoCents: number;
  antec: string;
  vagas: number;
  ativo: boolean;
};

type Filter = "todos" | "ativos" | "pausados";

const srOnly = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } as const;

/** Busca, filtro Todos/Ativos/Pausados e a tabela de exames. */
export function ExamsTable({ exams }: { exams: ExamRow[] }) {
  const [filtro, setFiltro] = useState<Filter>("todos");
  const [busca, setBusca] = useState("");

  const q = busca.trim().toLowerCase();
  const nAtivos = exams.filter((e) => e.ativo).length;
  const filtros: { id: Filter; label: string; n: number }[] = [
    { id: "todos", label: "Todos", n: exams.length },
    { id: "ativos", label: "Ativos", n: nAtivos },
    { id: "pausados", label: "Pausados", n: exams.length - nAtivos },
  ];
  const linhas = exams.filter((e) => {
    if (filtro === "ativos" && !e.ativo) return false;
    if (filtro === "pausados" && e.ativo) return false;
    if (q && `${e.nome} ${e.tipo} ${e.tuss ?? ""}`.toLowerCase().indexOf(q) < 0) return false;
    return true;
  });

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div className="field" style={{ flex: "1 1 320px", maxWidth: 420 }}>
          <label htmlFor="busca" className="lbl" style={srOnly}>
            Buscar exame
          </label>
          <input id="busca" className="input" type="search" placeholder="Buscar por nome ou código TUSS" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div role="group" aria-label="Situação" className="seg">
          {filtros.map((f) => {
            const on = filtro === f.id;
            return (
              <button key={f.id} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => setFiltro(f.id)}>
                {f.label} <span className="n">{f.n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Exame</th>
              <th scope="col">Sala</th>
              <th scope="col" className="n">
                Preço cheio
              </th>
              <th scope="col" className="n">
                Piso
              </th>
              <th scope="col">Antecedência</th>
              <th scope="col" className="n">
                Vagas em 30 dias
              </th>
              <th scope="col">Situação</th>
              <th scope="col">
                <span style={srOnly}>Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="ex-nome">{r.nome}</div>
                  <div className="small muted">
                    {r.tipo}
                    {r.tuss ? ` · TUSS ${r.tuss}` : ""}
                  </div>
                </td>
                <td>{r.sala}</td>
                <td className="n">
                  <span className="num" style={{ fontSize: 17 }}>
                    {brl(r.cheioCents)}
                  </span>
                </td>
                <td className="n">{brl(r.pisoCents)}</td>
                <td>{r.antec}</td>
                <td className="n">{r.vagas}</td>
                <td>
                  <span className={r.ativo ? "chip st-publicada" : "chip st-expirada"}>{r.ativo ? "Ativo" : "Pausado"}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <Link className="edit" href={`/clinica/exames/${r.id}`} aria-label={`Editar ${r.nome}`}>
                    <IconPencil size={18} />
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 ? (
          <p className="muted" style={{ padding: "24px 16px", textAlign: "center" }}>
            {exams.length === 0 ? "Nenhum exame cadastrado ainda. Use “Novo exame” para começar." : "Nenhum exame encontrado. Tente outro nome ou limpe a busca."}
          </p>
        ) : null}
      </div>
    </>
  );
}
