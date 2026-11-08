"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { deleteClinicExam, saveClinicExam } from "@/lib/actions";
import { CATALOG, clinicDefaultName, clinicScopeOptions, findType, type ExamType, type Region, type Scope } from "@/lib/catalog";
import { brl } from "@/lib/format";
import { IconClose } from "@/components/icons";
import { OptionPicker } from "@/components/OptionPicker";

export type ExamInitial = {
  id: string;
  regionKey: string;
  side: string | null;
  displayName: string;
  tuss: string | null;
  room: string;
  fullCents: number;
  floorCents: number;
  minNoticeHours: number;
  prep: string;
  prepStarts: string;
  lateToleranceMin: number;
  warnings: string[];
  active: boolean;
  durationMin: number;
};

/** Outro exame da clínica que pode ocupar o horário cancelado deste. */
export type SubstituteOption = { id: string; displayName: string; room: string; active: boolean; durationMin: number };

type Props =
  | { mode: "new"; options: SubstituteOption[] }
  | {
      mode: "edit";
      exam: ExamInitial;
      typeKey: string;
      path: string[];
      vacancies30d: number;
      reserved30d: number;
      editedAgo: string;
      options: SubstituteOption[];
      substitutes: string[];
    };

const STEPS: [string, number][] = [
  ["Preço cheio", 0],
  ["Faltando 48 h", 0.1],
  ["Faltando 24 h", 0.2],
  ["Faltando 6 h", 0.3],
];

/** "480" ou "480,50" (reais) → centavos. Vazio ou inválido → null. */
function parseReais(raw: string): number | null {
  let s = raw.replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

function reaisText(cents: number): string {
  const int = Math.floor(cents / 100);
  const c = cents % 100;
  return c ? `${int},${String(c).padStart(2, "0")}` : String(int);
}

/** "Ressonância de joelho" → "ressonância de joelho" (para usar no meio da frase). */
function lowerFirstWord(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function firstInt(raw: string): number | null {
  const m = raw.match(/\d+/);
  return m ? Number(m[0]) : null;
}

type Resolved = {
  crumbs: string[];
  question: string | null;
  options: { key: string; label: string; hint?: string; icon?: string }[];
  type: ExamType | null;
  region: Region | null;
  /** Abrangência da oferta: um lado ou bilateral. */
  side: Scope | null;
};

/** Caminho escolhido na árvore do catálogo (tipo → região → lado). */
function resolve(path: string[]): Resolved {
  const out: Resolved = { crumbs: [], question: null, options: [], type: null, region: null, side: null };
  const type = path[0] ? findType(path[0]) : undefined;
  if (!type) {
    out.question = "Qual tipo de exame?";
    out.options = CATALOG.map((t) => ({ key: t.key, label: t.fullLabel, hint: t.note, icon: t.key }));
    return out;
  }
  out.type = type;
  out.crumbs.push(type.label);
  let i = 1;
  let region: Region | undefined;
  if (type.regions.length === 1 && type.regions[0].key === type.key) {
    region = type.regions[0];
  } else {
    region = type.regions.find((r) => r.key === path[1]);
    if (!region) {
      out.question = type.question ?? "Qual região?";
      out.options = type.regions.map((r) => ({ key: r.key, label: r.label }));
      return out;
    }
    out.crumbs.push(region.label);
    i = 2;
  }
  if (region.sides) {
    const opts = clinicScopeOptions(region);
    const side = opts.find((o) => o.scope === path[i]);
    if (!side) {
      out.question = region.sides.kind === "mama" ? "Qual mamografia a clínica oferece?" : "Qual abrangência a clínica oferece?";
      out.options = opts.map((o) => ({ key: o.scope, label: o.label, hint: o.hint }));
      return out;
    }
    out.crumbs.push(side.label);
    out.side = side.scope;
  }
  out.region = region;
  return out;
}

export function ExamForm(props: Props) {
  const edit = props.mode === "edit" ? props : null;
  const init = edit?.exam;

  const [path, setPath] = useState<string[]>(edit ? edit.path : []);
  const [nome, setNome] = useState<string | null>(init ? init.displayName : null);
  const [tuss, setTuss] = useState(init?.tuss ?? "");
  const [cheio, setCheio] = useState(init ? reaisText(init.fullCents) : "");
  const [piso, setPiso] = useState(init ? reaisText(init.floorCents) : "");
  const [antec, setAntec] = useState(init ? `${init.minNoticeHours} h` : "3 h");
  const [prep, setPrep] = useState(init?.prep ?? "Nenhum");
  const [prepStarts, setPrepStarts] = useState(init?.prepStarts ?? "0 h antes");
  const [tolerancia, setTolerancia] = useState(init ? `${init.lateToleranceMin} min` : "15 min");
  const [avisos, setAvisos] = useState<string[]>(init?.warnings ?? []);
  const [adding, setAdding] = useState(false);
  const [novoAviso, setNovoAviso] = useState("");
  const [ativo, setAtivo] = useState(init?.active ?? true);
  const [subs, setSubs] = useState<string[]>(edit ? edit.substitutes : []);
  const [duracao, setDuracao] = useState<string | null>(init ? `${init.durationMin} min` : null);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const r = resolve(path);
  const asking = !edit && r.question !== null;
  const tipo = r.type ?? (edit ? findType(edit.typeKey) ?? null : null);
  const nomeExame = nome ?? (r.region ? clinicDefaultName(r.region.key, r.side) : "");
  // Duração sugerida: 40 min; bilateral, 60 min. A clínica ajusta.
  const duracaoTxt = duracao ?? (r.side === "bilateral" ? "60 min" : "40 min");
  const sala = edit ? init!.room : tipo?.room ?? "";
  // Só exames da mesma sala usam o mesmo equipamento e podem ocupar o horário.
  const durN = firstInt(duracaoTxt);
  // Substituto precisa caber no horário deste exame.
  const subOptions = props.options.filter((o) => o.room === sala && o.id !== init?.id && (durN === null || o.durationMin <= durN));

  const cheioCents = parseReais(cheio);
  const pisoCents = parseReais(piso);
  const cheioBad = !asking && cheio.trim() !== "" && (cheioCents === null || cheioCents <= 0);
  const pisoBad = !asking && piso.trim() !== "" && (pisoCents === null || pisoCents <= 0 || (cheioCents !== null && pisoCents > cheioCents));
  const antecN = firstInt(antec);
  const tolN = firstInt(tolerancia);

  let blocker: string | null = null;
  if (asking) blocker = "Escolha o exame";
  else if (cheioCents === null || cheioCents <= 0) blocker = "Informe o preço cheio";
  else if (pisoBad) blocker = "Corrija o preço piso";
  else if (pisoCents === null) blocker = "Informe o preço piso";

  const degraus = STEPS.map(([when, cut]) => ({
    when,
    price: cheioCents && cheioCents > 0 ? brl(Math.max(pisoCents ?? 0, Math.round(cheioCents * (1 - cut)))) : "—",
  }));

  function pick(key: string) {
    const next = [...path, key];
    if (path.length === 0) {
      const t = findType(key);
      setAvisos(t ? [...t.warnings] : []);
      setSubs([]);
    }
    setPath(next);
    setNome(null);
    setError("");
  }

  function addAviso() {
    const v = novoAviso.trim();
    if (v && !avisos.some((a) => a.toLowerCase() === v.toLowerCase())) setAvisos([...avisos, v]);
    setNovoAviso("");
    setAdding(false);
  }

  function onAvisoKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addAviso();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setNovoAviso("");
      setAdding(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (blocker || (!r.region && !edit)) return;
    if (!nomeExame.trim()) return setError("Informe o nome que o paciente vê.");
    if (antecN === null) return setError("Informe a antecedência mínima em horas, por exemplo 3 h.");
    if (tolN === null) return setError("Informe a tolerância de atraso em minutos, por exemplo 15 min.");
    if (durN === null || durN < 10 || durN > 240) return setError("Informe a duração do exame entre 10 e 240 minutos, por exemplo 40 min.");
    setError("");
    const input = {
      id: edit ? init!.id : null,
      regionKey: edit ? init!.regionKey : r.region!.key,
      side: edit ? init!.side : r.region!.sides ? r.side : null,
      displayName: nomeExame.trim(),
      tuss: tuss.trim(),
      room: sala,
      fullCents: cheioCents!,
      floorCents: pisoCents!,
      minNoticeHours: antecN,
      prep: prep.trim(),
      prepStarts: prepStarts.trim(),
      lateToleranceMin: tolN,
      warnings: avisos,
      active: ativo,
      substitutes: subs.filter((id) => subOptions.some((o) => o.id === id)),
      durationMin: durN,
    };
    startTransition(async () => {
      const res = await saveClinicExam(input);
      if (res && !res.ok) setError(res.error);
    });
  }

  function excluir() {
    if (!edit) return;
    startTransition(async () => {
      const res = await deleteClinicExam(init!.id);
      if (res && !res.ok) setError(res.error);
    });
  }

  const avisosHelp = edit
    ? "O paciente lê a lista e confirma que quer seguir. Os avisos não bloqueiam a reserva."
    : tipo && avisos.length
      ? `Sugeridos para ${tipo.label.toLowerCase()}. O paciente lê a lista e confirma que quer seguir; os avisos não bloqueiam a reserva.`
      : "Nenhum aviso sugerido para este tipo. Adicione se a clínica tiver algum.";

  const priceFields = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
      <div className="field">
        <label htmlFor="pc">Preço cheio (R$)</label>
        <input id="pc" className={cheioBad ? "input err" : "input"} inputMode="decimal" value={cheio} onChange={(e) => setCheio(e.target.value)} aria-invalid={cheioBad || undefined} />
        {cheioBad ? <span className="help err">Use só números, por exemplo 480 ou 480,50.</span> : null}
      </div>
      <div className="field">
        <label htmlFor="pp">Preço piso (R$)</label>
        <input id="pp" className={pisoBad ? "input err" : "input"} inputMode="decimal" value={piso} onChange={(e) => setPiso(e.target.value)} aria-invalid={pisoBad || undefined} aria-describedby="pp-help" />
        <span id="pp-help" className={pisoBad ? "help err" : "help"}>
          {pisoBad ? "O piso não pode passar do preço cheio." : "Menor valor que a vaga pode ter."}
        </span>
      </div>
      <div className="field">
        <label htmlFor="an">Antecedência mínima</label>
        <input id="an" className="input" value={antec} onChange={(e) => setAntec(e.target.value)} />
        <span className="help">Menos que isso, não vira vaga.</span>
      </div>
    </div>
  );

  const ruleFields = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
      <div className="field">
        <label htmlFor="du">Duração do exame</label>
        <input id="du" className="input" value={duracaoTxt} onChange={(e) => setDuracao(e.target.value)} />
        <span className="help">{r.side === "bilateral" || init?.side === "bilateral" ? "Os dois lados levam mais tempo." : "Tempo que o exame ocupa na sala."}</span>
      </div>
      <div className="field">
        <label htmlFor="pr">Preparo</label>
        <input id="pr" className="input" value={prep} onChange={(e) => setPrep(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ph">Preparo começa</label>
        <input id="ph" className="input" value={prepStarts} onChange={(e) => setPrepStarts(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="x">Tolerância de atraso</label>
        <input id="x" className="input" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} />
        <span className="help">Depois disso a clínica pode declarar falta.</span>
      </div>
    </div>
  );

  const warningsBlock = (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {edit ? (
        <legend className="lbl" style={{ paddingBottom: 8 }}>
          Avisos ao paciente antes de reservar
        </legend>
      ) : (
        <legend className="step" style={{ paddingBottom: 8 }}>
          <span className="sn">4</span>Avisos ao paciente antes de reservar
        </legend>
      )}
      <p className="help" style={{ marginTop: -4 }}>
        {avisosHelp}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {avisos.map((a) => (
          <span key={a} className="tag rm">
            {a}
            <button type="button" className="tag-x" aria-label={`Remover aviso ${a}`} onClick={() => setAvisos(avisos.filter((x) => x !== a))}>
              <IconClose size={16} />
            </button>
          </span>
        ))}
        {adding ? (
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <label htmlFor="novo-aviso" className="sr-only">
              Novo aviso
            </label>
            <input
              id="novo-aviso"
              className="input"
              style={{ minHeight: 44, width: 240, maxWidth: "100%" }}
              placeholder="Ex.: Diabetes"
              value={novoAviso}
              onChange={(e) => setNovoAviso(e.target.value)}
              onKeyDown={onAvisoKey}
              autoFocus
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={addAviso}>
              Adicionar
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            Adicionar
          </button>
        )}
      </div>
    </fieldset>
  );

  const nomeCurto = nomeExame.trim() ? lowerFirstWord(nomeExame.trim()) : "este exame";
  const substitutesBlock = (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {edit ? (
        <legend className="lbl" style={{ paddingBottom: 8 }}>
          Exames que podem ocupar o horário
        </legend>
      ) : (
        <legend className="step" style={{ paddingBottom: 8 }}>
          <span className="sn">5</span>Exames que podem ocupar o horário
        </legend>
      )}
      <p className="help" style={{ marginTop: -4 }}>
        Se um agendamento de {nomeCurto} for cancelado, a vaga de encaixe aparece também para quem procura estes exames, cada um pelo
        preço dele. {sala ? `Só aparecem exames da sala ${sala}, que usam o mesmo equipamento.` : ""}
      </p>
      {subOptions.length > 0 ? (
        <div className="sub-grid">
          {subOptions.map((o) => {
            const on = subs.includes(o.id);
            return (
              <label key={o.id} className={on ? "sub-opt on" : "sub-opt"}>
                <input type="checkbox" checked={on} onChange={() => setSubs(on ? subs.filter((x) => x !== o.id) : [...subs, o.id])} />
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{o.displayName}</span>
                  {o.active ? null : <span className="small muted">Pausado: só recebe a vaga quando voltar a aceitar encaixe</span>}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="small muted">{sala ? `Nenhum outro exame cadastrado na sala ${sala}.` : "Escolha o exame para ver os da mesma sala."}</p>
      )}
      {subOptions.length > 0 ? (
        <p className="small muted">
          {subs.length === 0
            ? "Nenhum marcado: o horário cancelado vira vaga só para este exame."
            : `${subs.length} ${subs.length === 1 ? "exame marcado" : "exames marcados"} além deste.`}
        </p>
      ) : null}
    </fieldset>
  );

  const nameFields = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor="nm">Nome que o paciente vê</label>
        <input id="nm" className="input" value={nomeExame} onChange={(e) => setNome(e.target.value)} />
        {edit ? null : <span className="help">Sugerido pela escolha acima. Pode ajustar.</span>}
      </div>
      <div className="field">
        <label htmlFor="tuss">Código TUSS</label>
        <input id="tuss" className="input" placeholder="Digite o código" value={tuss} onChange={(e) => setTuss(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="sala">Sala da agenda</label>
        <input id="sala" className="input" value={sala} readOnly />
        {edit ? null : <span className="help">Onde as vagas deste exame aparecem.</span>}
      </div>
    </div>
  );

  const errorNode = error ? (
    <p role="alert" className="help err" style={{ flex: "1 1 100%" }}>
      {error}
    </p>
  ) : null;

  const saveButton = blocker ? (
    <button type="button" className="btn" disabled>
      {blocker}
    </button>
  ) : (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Salvando…" : edit ? "Salvar alterações" : "Salvar exame"}
    </button>
  );

  const aside = (
    <aside style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: 22 }}>Como o preço desce</h2>
      <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        {degraus.map((g) => (
          <div key={g.when} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <span className="muted">{g.when}</span>
            <span className="num" style={{ fontSize: 24 }}>
              {g.price}
            </span>
          </div>
        ))}
        <hr className="hr" />
        <p className="small muted">Nenhum degrau passa abaixo do piso. O preço nunca sobe.</p>
      </div>
    </aside>
  );

  if (edit) {
    const v = edit.vacancies30d;
    const m = edit.reserved30d;
    return (
      <>
        <header style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <Link href="/clinica/exames" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>
              Voltar aos exames
            </Link>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <h1 style={{ fontSize: 36 }}>Editar exame</h1>
              <span className={ativo ? "chip st-publicada" : "chip st-expirada"}>{ativo ? "Ativo" : "Pausado"}</span>
            </div>
            <p className="muted">
              {init!.displayName} · {v} {v === 1 ? "vaga publicada" : "vagas publicadas"} e {m} {m === 1 ? "reservada" : "reservadas"} nos últimos 30 dias · editado {edit.editedAgo}
            </p>
          </div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              padding: "0 14px",
              borderRadius: 14,
              background: "#fff",
              boxShadow: "inset 0 0 0 1.5px var(--line)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <input type="checkbox" checked={ativo} onChange={() => setAtivo(!ativo)} style={{ width: 20, height: 20, accentColor: "#2a7f75", margin: 0 }} />
            Aceita vagas de encaixe
          </label>
        </header>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
          <form className="card" onSubmit={submit} noValidate style={{ flex: "2 1 460px", minWidth: 0, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
            <section aria-labelledby="s1" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 id="s1" style={{ fontSize: 17 }}>
                Exame
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {r.crumbs.map((c, i) => (
                  <span key={`${i}-${c}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {i > 0 ? (
                      <span className="muted" aria-hidden="true">
                        ›
                      </span>
                    ) : null}
                    <span className="tag" style={{ background: "var(--mint)", boxShadow: "none", color: "var(--teal-d)" }}>
                      {c}
                    </span>
                  </span>
                ))}
              </div>
              <p className="help">
                O tipo, a região e o lado não mudam depois de criado, porque os pacientes da fila buscaram por eles. Para oferecer outro exame, crie um novo.
              </p>
            </section>
            {nameFields}
            {priceFields}
            {ruleFields}
            {warningsBlock}
            {substitutesBlock}

            <p className="small muted">Mudança de preço vale para as próximas vagas e também para as vagas abertas que ainda não foram reservadas.</p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              {errorNode}
              {confirmar ? (
                <div
                  role="alert"
                  style={{
                    flex: "1 1 100%",
                    background: "var(--red-s)",
                    color: "#7A1D14",
                    borderRadius: 14,
                    padding: "12px 14px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px 16px",
                    alignItems: "center",
                  }}
                >
                  <span style={{ flex: "1 1 280px" }}>
                    <strong>Excluir este exame?</strong> Ele sai do marketplace e não recebe novas vagas. Reservas já pagas continuam valendo.
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmar(false)} disabled={pending}>
                    Manter exame
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={excluir} disabled={pending}>
                    {pending ? "Excluindo…" : "Excluir exame"}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-danger" onClick={() => setConfirmar(true)}>
                  Excluir exame
                </button>
              )}
              <div style={{ flex: 1 }} />
              <Link className="btn btn-ghost" href="/clinica/exames">
                Cancelar
              </Link>
              {saveButton}
            </div>
          </form>
          {aside}
        </div>
      </>
    );
  }

  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Link href="/clinica/exames" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>
          Voltar aos exames
        </Link>
        <h1 style={{ fontSize: 36 }}>Novo exame</h1>
        <p className="muted">Define o preço, o piso e as regras que o paciente vê antes de reservar.</p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <form className="card" onSubmit={submit} noValidate style={{ flex: "2 1 460px", minWidth: 0, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <section aria-labelledby="s1" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 id="s1" className="step">
              <span className="sn">1</span>Qual exame a clínica vai oferecer?
            </h2>
            <p className="help">Do mesmo jeito que o paciente procura: tipo, região e, quando houver, se é um lado ou os dois.</p>

            {r.crumbs.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px", alignItems: "center" }}>
                {r.crumbs.map((c, level) => (
                  <span key={`${level}-${c}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      className="crumb"
                      aria-label={`Trocar ${c}`}
                      onClick={() => {
                        setPath(path.slice(0, level));
                        setNome(null);
                      }}
                    >
                      {c}
                    </button>
                    {level < r.crumbs.length - 1 ? (
                      <span className="muted" aria-hidden="true">
                        ›
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}

            {asking ? (
              <div className="opts" key={path.join(">")} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p className="lbl">{r.question}</p>
                <OptionPicker options={r.options} onPick={pick} wide />
              </div>
            ) : (
              <div className="opts" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {nameFields}
              </div>
            )}
          </section>

          <fieldset className={asking ? "resto off" : "resto"} disabled={asking}>
            {asking ? <p className="small muted">Escolha o exame para liberar preço, regras, avisos e substitutos.</p> : null}
            <h2 className="step">
              <span className="sn">2</span>Preço
            </h2>
            {priceFields}

            <h2 className="step">
              <span className="sn">3</span>Preparo e regras da vaga
            </h2>
            {ruleFields}

            {warningsBlock}
            {substitutesBlock}
          </fieldset>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "flex-end" }}>
            {errorNode}
            <Link className="btn btn-ghost" href="/clinica/exames">
              Cancelar
            </Link>
            {saveButton}
          </div>
        </form>
        {aside}
      </div>
    </>
  );
}
