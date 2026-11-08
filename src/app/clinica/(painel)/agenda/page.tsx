import { Suspense } from "react";
import { AgendaShell } from "@/components/clinica/AgendaShell";
import { getDemoNow, getGoogleConnection, listAgenda, ROOMS, type AgendaBlock } from "@/lib/data";
import { addDays, longDay, spDay, spMinutes, spTime } from "@/lib/format";
import "./agenda.css";

// Grade de 07:00 a 22:00, 48 px por hora, como na prancha.
const HOUR = 48;
const START = 7;
const END = 22;

const KIND_CLASS: Record<AgendaBlock["kind"], string> = {
  patient: "ev ev-paciente",
  vacancy: "ev ev-vaga",
  booked: "ev ev-reservada",
  block: "ev ev-bloqueio",
};

const GOOGLE = "#3b6fd8";
const VC = "#2a7f75";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="clinic-main" style={{ paddingTop: 28, paddingBottom: 36, gap: 18 }}>
      <Suspense
        fallback={
          <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={{ fontSize: 36 }}>Agenda</h1>
            <span className="small muted">Carregando a agenda…</span>
          </header>
        }
      >
        <Agenda searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function validDay(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

async function Agenda({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [now, google] = await Promise.all([getDemoNow(), getGoogleConnection()]);
  const today = spDay(now);
  const day = validDay(sp.dia) ?? today;
  const connected = !!google?.connected;
  // Lê também os eventos do Google para saber quais salas ficam sem a agenda sincronizada.
  const all = await listAgenda(day, { googleConnected: true });

  return (
    <AgendaShell
      day={day}
      dayLabel={longDay(day)}
      prevHref={`/clinica/agenda?dia=${addDays(day, -1)}`}
      nextHref={`/clinica/agenda?dia=${addDays(day, 1)}`}
      googleConnected={connected}
      googleEmail={google?.account_email ?? null}
      rooms={[...ROOMS]}
    >
      <AgendaGrid blocks={all} connected={connected} nowMin={day === today ? spMinutes(now) : null} />
    </AgendaShell>
  );
}

function AgendaGrid({ blocks, connected, nowMin }: { blocks: AgendaBlock[]; connected: boolean; nowMin: number | null }) {
  const rooms = ROOMS.map((room) => {
    const own = blocks.filter((b) => b.room === room);
    const visible = own.filter((b) => b.source !== "google" || connected);
    const nPac = visible.filter((b) => b.kind === "patient" || b.kind === "booked").length;
    const nVaga = visible.filter((b) => b.kind === "vacancy").length;
    const missingSource = !connected && own.some((b) => b.source === "google");
    return {
      room,
      // Os cadastros manuais continuam contando; só sinaliza que os da Google estão fora.
      resumo: `${nPac} ${nPac === 1 ? "exame" : "exames"} · ${nVaga} ${nVaga === 1 ? "vaga" : "vagas"}${missingSource ? " · sem a Google" : ""}`,
      events: visible.map((b) => {
        const a = Math.max(START * 60, spMinutes(b.starts_at));
        const endRaw = spMinutes(b.ends_at);
        // Evento que passa da meia-noite termina, na grade, às 22:00.
        const z = Math.min(END * 60, endRaw <= a ? END * 60 : endRaw);
        const h = Math.max(20, ((z - a) / 60) * HOUR - 2);
        const hora = spTime(b.starts_at);
        const fim = spTime(b.ends_at);
        const origem = b.source === "google" ? "Google Agenda" : b.source === "manual" ? "cadastrado aqui" : "remark";
        return {
          id: b.id,
          cls: KIND_CLASS[b.kind],
          top: ((a - START * 60) / 60) * HOUR + 1,
          h,
          alto: h >= 34 && !!b.detail,
          hora,
          nome: b.title,
          detalhe: b.detail,
          cor: b.source === "google" ? GOOGLE : b.kind === "booked" ? "#ffffff" : VC,
          titulo: `${hora}–${fim} ${b.title}${b.detail ? ` · ${b.detail}` : ""} · ${origem}`,
          hidden: spMinutes(b.starts_at) >= END * 60 || (endRaw > spMinutes(b.starts_at) && endRaw <= START * 60),
        };
      }),
    };
  });

  const hours: { top: number; label: string }[] = [];
  for (let i = START + 1; i < END; i++) hours.push({ top: (i - START) * HOUR, label: `${i < 10 ? "0" : ""}${i}:00` });
  const nowTop = nowMin != null && nowMin >= START * 60 && nowMin <= END * 60 ? ((nowMin - START * 60) / 60) * HOUR : null;

  return (
    <>
      <div className="cal-scroll">
        <div className="cal">
          <div style={{ borderBottom: "1px solid var(--line)" }} />
          {rooms.map((c) => (
            <div key={c.room} className="cal-h">
              <strong>{c.room}</strong>
              <span className="small muted">{c.resumo}</span>
            </div>
          ))}

          <div className="hours" aria-hidden="true">
            {hours.map((h) => (
              <span key={h.label} style={{ top: h.top }}>
                {h.label}
              </span>
            ))}
          </div>
          {rooms.map((c) => (
            <div key={c.room} className="col" role="list" aria-label={`Sala ${c.room}`}>
              {nowTop != null ? <div className="now" style={{ top: nowTop }} aria-hidden="true" /> : null}
              {c.events
                .filter((e) => !e.hidden)
                .map((e) => (
                  <div key={e.id} role="listitem" className={e.cls} style={{ top: e.top, height: e.h }} title={e.titulo}>
                    <span className="t">
                      <span className="dot" style={{ background: e.cor }} />
                      {e.hora} · <b>{e.nome}</b>
                    </span>
                    {e.alto ? <span style={{ opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.detalhe}</span> : null}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>

      <div className="leg" aria-label="Legenda">
        <span>
          <i style={{ background: "#f1f8f6", boxShadow: "inset 0 0 0 1px #b3d1ca" }} />
          Paciente marcado
        </span>
        <span>
          <i style={{ background: "var(--amber-s)", border: "1.5px dashed var(--teal-d)" }} />
          Vaga de encaixe publicada
        </span>
        <span>
          <i style={{ background: "var(--teal)" }} />
          Reservado pelo remark
        </span>
        <span>
          <i style={{ background: "repeating-linear-gradient(135deg,#eef3f2 0,#eef3f2 4px,#e2ebe9 4px,#e2ebe9 8px)" }} />
          Bloqueio
        </span>
        <span style={{ color: "var(--mute)" }}>O ponto colorido mostra de qual agenda veio cada horário; verde é cadastro feito aqui.</span>
      </div>
    </>
  );
}
