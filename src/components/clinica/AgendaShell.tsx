"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { createCalendarEvent, setGoogleConnection } from "@/lib/actions";
import { spInstant } from "@/lib/format";
import { IconCheck, IconChevronLeft, IconLink, IconNext, IconPlus, IconSync, Logo } from "@/components/icons";
import { Dialog, DialogHeader } from "./Dialog";
import { SyncedAgo } from "./SyncedAgo";
import { useToast } from "./Toast";

const SOON = "Esta feature está a caminho";
const DEFAULT_EMAIL = "agenda@imagemvilanova.com.br";
const START = 7;
const END = 22;

type ProviderKey = "google" | "calendly" | "outlook" | "icloud" | "ical";

const PROVIDERS: { key: ProviderKey; nome: string; cor: string; letra: string; desc: string }[] = [
  { key: "google", nome: "Google Agenda", cor: "#3b6fd8", letra: "G", desc: "Sincroniza as agendas da sua conta Google." },
  { key: "calendly", nome: "Calendly", cor: "#7b4fd6", letra: "C", desc: "Traz os horários marcados pelo seu link de agendamento." },
  { key: "outlook", nome: "Outlook", cor: "#c2560e", letra: "O", desc: "Agendas do Microsoft 365 ou Outlook.com." },
  { key: "icloud", nome: "Apple iCloud", cor: "#5b6b70", letra: "A", desc: "Calendários do iCloud por CalDAV." },
  { key: "ical", nome: "Link iCal", cor: "#1f6a61", letra: "i", desc: "Cole o link .ics de qualquer sistema de agenda." },
];

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Cabeçalho, fitas das agendas, diálogos "Conectar agenda" e "Novo horário" da Agenda. A grade vem pronta do servidor. */
export function AgendaShell({
  day,
  dayLabel,
  prevHref,
  nextHref,
  googleConnected,
  googleEmail,
  openConnect = false,
  rooms,
  children,
}: {
  day: string;
  dayLabel: string;
  prevHref: string;
  nextHref: string;
  googleConnected: boolean;
  googleEmail: string | null;
  /** Vem do aviso «Conectar agenda» do perfil da clínica: abre o diálogo de conexão. */
  openConnect?: boolean;
  rooms: string[];
  children: ReactNode;
}) {
  const toast = useToast();
  const [connectOpen, setConnectOpen] = useState(openConnect);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 style={{ fontSize: 36 }}>Agenda</h1>
          <span className="small muted">
            Cadastre os horários direto aqui ou sincronize com as agendas que a clínica já usa. <SyncedAgo prefix="Sincronizada" />.
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Link href={prevHref} className="btn btn-ghost btn-sm" aria-label="Dia anterior" style={{ width: 44, padding: 0 }}>
              <IconChevronLeft />
            </Link>
            <Link href="/clinica/agenda" className="btn btn-ghost btn-sm">
              Hoje
            </Link>
            <Link href={nextHref} className="btn btn-ghost btn-sm" aria-label="Próximo dia" style={{ width: 44, padding: 0 }}>
              <IconNext />
            </Link>
          </div>
          <strong style={{ fontSize: 17, minWidth: 190 }} aria-live="polite">
            {dayLabel}
          </strong>
          <div className="seg" role="group" aria-label="Visualização">
            <button type="button" className="seg-view on" aria-pressed="true">
              Dia
            </button>
            <button type="button" className="seg-view" aria-pressed="false" onClick={() => toast.show(SOON)}>
              Semana
            </button>
            <button type="button" className="seg-view" aria-pressed="false" onClick={() => toast.show(SOON)}>
              Mês
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConnectOpen(true)}>
            <IconLink />
            Conectar agenda
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}>
            <IconPlus />
            Novo horário
          </button>
        </div>
      </header>

      <section aria-label="Agendas conectadas" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {googleConnected ? (
          <span className="src">
            <span className="dot" style={{ background: "#3b6fd8" }} />
            Google Agenda <span className="sub">{googleEmail ?? "conta conectada"}</span>
          </span>
        ) : null}
        <span className="src">
          <span className="dot" style={{ background: "#2a7f75" }} />
          Agenda remark <span className="sub">cadastros manuais, encaixes e reservas</span>
        </span>
        <button type="button" className="src src-add" onClick={() => setConnectOpen(true)}>
          <IconPlus size={16} />
          Adicionar outra
        </button>
      </section>

      {children}

      {connectOpen ? (
        <ConnectDialog
          googleConnected={googleConnected}
          googleEmail={googleEmail}
          rooms={rooms}
          onClose={() => setConnectOpen(false)}
          onDone={(msg) => {
            setConnectOpen(false);
            toast.show(msg);
          }}
        />
      ) : null}

      {newOpen ? <NewSlotDialog day={day} rooms={rooms} googleConnected={googleConnected} onClose={() => setNewOpen(false)} /> : null}

      {toast.node}
    </>
  );
}

function ConnectDialog({
  googleConnected,
  googleEmail,
  rooms,
  onClose,
  onDone,
}: {
  googleConnected: boolean;
  googleEmail: string | null;
  rooms: string[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [step, setStep] = useState<"list" | "consent">("list");
  const [soon, setSoon] = useState<ProviderKey | null>(null);
  const [email, setEmail] = useState(googleEmail ?? DEFAULT_EMAIL);
  const [calendars, setCalendars] = useState<string[]>(rooms);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function disconnect() {
    setError("");
    startTransition(async () => {
      const res = await setGoogleConnection(false);
      if (!res.ok) setError(res.error);
      else onDone("Google Agenda desconectada. Os horários dela saíram da grade.");
    });
  }

  function allow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Informe um e-mail válido para a conta.");
      return;
    }
    if (calendars.length === 0) {
      setError("Escolha pelo menos uma agenda para importar.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await setGoogleConnection(true, value);
      if (!res.ok) setError(res.error);
      else onDone("Google Agenda conectada. Os horários dela já aparecem na grade.");
    });
  }

  const close = () => {
    if (!pending) onClose();
  };

  if (step === "consent") {
    return (
      <Dialog key="consent" labelledBy="t-consent" onClose={close} onSubmit={allow} width={520} paddingTop={110} style={{ gap: 16 }}>
        <div className="consent-head" aria-hidden="true">
          <span className="logo" style={{ background: "#3b6fd8" }}>
            G
          </span>
          <svg className="ico" viewBox="0 0 24 24" style={{ color: "var(--mute)" }}>
            <path d="M5 9h14l-4-4M19 15H5l4 4" />
          </svg>
          <Logo size={40} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 id="t-consent" style={{ fontSize: 24 }}>
            Permitir acesso à Google Agenda
          </h2>
          <p className="small muted">O remark vai ler as agendas da clínica para mostrar os horários juntos e achar os cancelamentos.</p>
        </div>

        <div className="field">
          <label htmlFor="c-email">Conta</label>
          <input
            id="c-email"
            className={error.includes("e-mail") ? "input err" : "input"}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            data-autofocus
          />
          <span className="help">A conta Google onde ficam as agendas da clínica.</span>
        </div>

        <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <legend className="lbl" style={{ padding: "0 0 8px" }}>
            Agendas para importar
          </legend>
          {rooms.map((r) => {
            const on = calendars.includes(r);
            return (
              <label key={r} className="consent-cal">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    setError("");
                    setCalendars((list) => (on ? list.filter((x) => x !== r) : [...list, r]));
                  }}
                />
                {r}
              </label>
            );
          })}
        </fieldset>

        <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, background: "var(--mint)", boxShadow: "none" }}>
          <strong className="small">O remark poderá:</strong>
          <ul className="consent-list small">
            <li>ver os horários, os nomes e os exames dos eventos dessas agendas;</li>
            <li>marcar como ocupado o horário reservado por um paciente do app.</li>
          </ul>
          <span className="small muted">Ele não vê outras agendas da conta nem e-mails, contatos ou arquivos.</span>
        </div>

        {error ? (
          <p role="alert" className="help err">
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setError("");
              setStep("list");
            }}
          >
            Voltar
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? "Conectando…" : "Permitir"}
          </button>
        </div>
        <p className="small muted">Conexão simulada nesta versão. Nada é enviado aos serviços.</p>
      </Dialog>
    );
  }

  return (
    <Dialog key="list" labelledBy="t-con" onClose={close} width={560} paddingTop={110} style={{ gap: 14 }}>
      <DialogHeader id="t-con" title="Conectar agenda" onClose={close}>
        Os horários das agendas conectadas aparecem juntos aqui. Quando um paciente desmarca em qualquer uma delas, o horário vira vaga de encaixe.
      </DialogHeader>
      <div>
        {PROVIDERS.map((p) => {
          const on = p.key === "google" && googleConnected;
          return (
            <div key={p.key} className="prov">
              <span className="logo" style={{ background: p.cor }} aria-hidden="true">
                {p.letra}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{p.nome}</strong>
                <div className="small muted">{on && googleEmail ? `${p.desc} Conta: ${googleEmail}.` : p.desc}</div>
                {soon === p.key ? (
                  <div className="small soon" role="status">
                    {SOON}
                  </div>
                ) : null}
              </div>
              {on ? (
                <>
                  <span className="ok">
                    <IconCheck size={18} />
                    Conectada
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={disconnect} disabled={pending} aria-label={`Desconectar ${p.nome}`}>
                    {pending ? "Desconectando…" : "Desconectar"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  aria-label={`Conectar ${p.nome}`}
                  onClick={() => {
                    if (p.key === "google") {
                      setError("");
                      setStep("consent");
                    } else {
                      setSoon(p.key);
                    }
                  }}
                >
                  Conectar
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="help err">
          {error}
        </p>
      ) : null}
      <p className="small muted">Conexão simulada nesta versão. Nada é enviado aos serviços.</p>
    </Dialog>
  );
}

type SlotForm = { tipo: "paciente" | "bloqueio"; nome: string; det: string; sala: string; ini: string; fim: string };

function NewSlotDialog({ day, rooms, googleConnected, onClose }: { day: string; rooms: string[]; googleConnected: boolean; onClose: () => void }) {
  const [form, setForm] = useState<SlotForm>({ tipo: "paciente", nome: "", det: "", sala: rooms[0] ?? "", ini: "16:20", fim: "17:00" });
  const [erro, setErro] = useState("");
  const [pending, startTransition] = useTransition();
  const isPac = form.tipo === "paciente";

  function set<K extends keyof SlotForm>(k: K, v: SlotForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErro("");
  }

  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.nome.trim()) {
      setErro(isPac ? "Informe o nome do paciente." : "Informe o motivo do bloqueio.");
      return;
    }
    if (!form.ini || !form.fim || toMin(form.fim) <= toMin(form.ini)) {
      setErro("O horário de fim precisa ser depois do início.");
      return;
    }
    if (toMin(form.ini) < START * 60 || toMin(form.fim) > END * 60) {
      setErro("A agenda vai das 07:00 às 22:00. Ajuste o início ou o fim.");
      return;
    }
    startTransition(async () => {
      const res = await createCalendarEvent({
        room: form.sala,
        startsAt: spInstant(day, form.ini),
        endsAt: spInstant(day, form.fim),
        kind: isPac ? "patient" : "block",
        title: form.nome.trim(),
        detail: form.det.trim(),
      });
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      onClose();
    });
  }

  const close = () => {
    if (!pending) onClose();
  };

  const nomeErr = erro.includes("nome") || erro.includes("motivo");
  const horaErr = erro.includes("fim") || erro.includes("07:00");

  return (
    <Dialog labelledBy="t-novo" onClose={close} onSubmit={salvar} width={560} paddingTop={90}>
      <DialogHeader id="t-novo" title="Novo horário" onClose={close}>
        Fica salvo na agenda do remark, mesmo sem nenhuma agenda conectada.
      </DialogHeader>

      <div role="group" aria-label="Tipo de horário" className="seg" style={{ display: "flex" }}>
        {(
          [
            { id: "paciente", label: "Paciente marcado" },
            { id: "bloqueio", label: "Bloqueio" },
          ] as const
        ).map((t) => {
          const sel = form.tipo === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={sel ? "on" : ""}
              aria-pressed={sel}
              onClick={() => set("tipo", t.id)}
              style={{ flex: 1, minHeight: 40, border: 0, borderRadius: 10, font: "600 14px var(--f-body), system-ui, sans-serif", cursor: "pointer" }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="f-nome">{isPac ? "Paciente" : "Motivo do bloqueio"}</label>
          <input
            id="f-nome"
            className={nomeErr ? "input err" : "input"}
            value={form.nome}
            onChange={(e) => set("nome", e.target.value)}
            placeholder={isPac ? "Nome do paciente" : "Ex.: manutenção, reunião, folga"}
            aria-invalid={nomeErr || undefined}
            data-autofocus
          />
        </div>
        <div className="field">
          <label htmlFor="f-sala">Sala</label>
          <select id="f-sala" className="input" value={form.sala} onChange={(e) => set("sala", e.target.value)}>
            {rooms.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-det">{isPac ? "Exame" : "Observação"}</label>
          <input id="f-det" className="input" value={form.det} onChange={(e) => set("det", e.target.value)} placeholder={isPac ? "Ex.: joelho esquerdo" : "Opcional"} />
        </div>
        <div className="field">
          <label htmlFor="f-data">Dia</label>
          <input id="f-data" className="input" type="date" value={day} readOnly />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div className="field">
            <label htmlFor="f-ini">Início</label>
            <input id="f-ini" className={horaErr ? "input err" : "input"} type="time" step={600} value={form.ini} onChange={(e) => set("ini", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-fim">Fim</label>
            <input id="f-fim" className={horaErr ? "input err" : "input"} type="time" step={600} value={form.fim} onChange={(e) => set("fim", e.target.value)} />
          </div>
        </div>
      </div>

      {erro ? (
        <p role="alert" className="help err">
          {erro}
        </p>
      ) : null}

      <div className="panel" style={{ padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start", background: "var(--mint)", boxShadow: "none" }}>
        <IconSync style={{ color: "var(--teal-d)" }} />
        <span className="small">
          {googleConnected
            ? "Também vai para Google Agenda, e quem marcar por lá vê o horário ocupado."
            : "Nenhuma agenda conectada. O horário fica só no remark."}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Salvando…" : "Salvar horário"}
        </button>
      </div>
    </Dialog>
  );
}
