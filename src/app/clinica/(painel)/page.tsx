import { Suspense } from "react";
import { DemoClock } from "@/components/clinica/DemoClock";
import { PublishCancellation, type UpcomingAppointment } from "@/components/clinica/PublishCancellation";
import { SyncedAgo } from "@/components/clinica/SyncedAgo";
import { discountPct, leftLabel } from "@/components/clinica/pricing";
import { getVacancyContext, listSubstituteNames, type VacancyContext } from "@/lib/clinica-data";
import { getDashboardStats, getDemoNow, getDemoOffset, listClinicVacancies, listUpcomingAppointments, type VacancyLive } from "@/lib/data";
import { brl, relDay, spTime } from "@/lib/format";
import "./painel.css";

export default function PainelPage() {
  return (
    <main className="clinic-main">
      <Suspense fallback={<PainelFallback />}>
        <Painel />
      </Suspense>
    </main>
  );
}

function PainelFallback() {
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h1 style={{ fontSize: 36 }}>Painel</h1>
      <span className="small muted">Carregando a agenda…</span>
    </header>
  );
}

const ORIGIN: Record<VacancyLive["reason"], string> = {
  cancelamento: "cancelamento na agenda",
  vazio: "horário vazio",
  noite: "horário noturno",
};

const STATUS: Record<VacancyLive["status"], { label: string; cls: string }> = {
  publicada: { label: "Publicada", cls: "chip st-publicada" },
  alertando: { label: "Alertando", cls: "chip st-alertando" },
  reservada: { label: "Reservada", cls: "chip st-reservada" },
  expirada: { label: "Expirada", cls: "chip st-expirada" },
};

function when(iso: string, now: Date) {
  return `${relDay(iso, now)}, ${spTime(iso)}`;
}

async function Painel() {
  const [now, offset, stats, vacancies, upcoming] = await Promise.all([
    getDemoNow(),
    getDemoOffset(),
    getDashboardStats(),
    listClinicVacancies(),
    listUpcomingAppointments(),
  ]);
  const [ctx, subsByExam] = await Promise.all([getVacancyContext(vacancies), listSubstituteNames(upcoming.map((a) => a.clinic_exam.id))]);

  const appointments: UpcomingAppointment[] = upcoming.map((a) => ({
    id: a.id,
    quando: when(a.starts_at, now),
    paciente: a.title,
    exame: a.clinic_exam.display_name,
    sala: a.room,
    startsAt: a.starts_at,
    fullCents: a.clinic_exam.full_price_cents,
    floorCents: a.clinic_exam.floor_price_cents,
    substitutos: subsByExam[a.clinic_exam.id] ?? [],
  }));

  const latest = vacancies[0] ?? null;

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 style={{ fontSize: 36 }}>Painel</h1>
          <span className="small muted">
            <SyncedAgo />
          </span>
        </div>
        <PublishCancellation appointments={appointments} nowIso={now.toISOString()} />
      </header>

      <section aria-label="Resumo do dia" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
        <Stat label="Vagas publicadas hoje" value={String(stats.published)} />
        <Stat label="Reservadas" value={String(stats.reserved)} />
        <Stat label="Receita recuperada" value={brl(stats.revenueCents)} />
        <Stat label="Taxa de preenchimento" value={`${stats.fillRate}%`} />
      </section>

      <DemoClock offsetHours={offset} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <section style={{ flex: "2 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 22 }}>Vagas de encaixe</h2>
          {vacancies.map((v) => (
            <VacancyCard key={v.id} v={v} now={now} ctx={ctx} />
          ))}
          {vacancies.length === 0 ? (
            <div className="card" style={{ padding: "14px 18px" }}>
              <p className="muted">Nenhuma vaga de encaixe nas últimas 24 horas. Publique um cancelamento para começar.</p>
            </div>
          ) : null}
        </section>

        <section style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 22 }}>Linha do tempo</h2>
          <div className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 0 }}>
            {latest ? <Timeline v={latest} now={now} ctx={ctx} /> : <p className="small muted">A linha do tempo aparece quando a primeira vaga for publicada.</p>}
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="small muted">{label}</div>
      <div className="num" style={{ fontSize: 40 }}>
        {value}
      </div>
    </div>
  );
}

function VacancyCard({ v, now, ctx }: { v: VacancyLive; now: Date; ctx: VacancyContext }) {
  const status = STATUS[v.status] ?? STATUS.publicada;
  const left = Number(v.hours_left);
  let preco: string;
  let nota: string;
  if (v.status === "expirada") {
    preco = "—";
    nota = "passou do horário";
  } else if (v.status === "reservada") {
    preco = brl(ctx.reservations[v.id]?.price_cents ?? v.price_cents);
    nota = "sinal pago";
  } else {
    const pct = discountPct(v.full_price_cents, v.price_cents);
    preco = brl(v.price_cents);
    nota = v.step === 0 || pct === 0 ? "preço cheio" : `−${pct}% · faltam ${leftLabel(left)}`;
  }
  return (
    <div className="card" style={{ padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: "12px 18px", alignItems: "center" }}>
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <strong style={{ fontSize: 17 }}>{v.display_name}</strong>
        <div className="small muted">
          {when(v.starts_at, now)} · {ORIGIN[v.reason]}
        </div>
      </div>
      <span className={status.cls}>{status.label}</span>
      <div style={{ minWidth: 112, textAlign: "right" }}>
        <div className="num" style={{ fontSize: 26 }}>
          {preco}
        </div>
        <div className="small muted">{nota}</div>
      </div>
    </div>
  );
}

type Step = { title: string; detail: string; dot: string; muted?: boolean };

function Timeline({ v, now, ctx }: { v: VacancyLive; now: Date; ctx: VacancyContext }) {
  const day = relDay(v.starts_at, now);
  const dayLabel = day === "Hoje" || day === "Amanhã" ? day.toLowerCase() : day;
  const publishedAt = spTime(v.published_at);

  let origin: string;
  if (v.reason === "cancelamento") {
    const source = v.event_id ? ctx.eventSources[v.event_id] : undefined;
    origin = source === "google" ? "Evento apagado na Google Agenda" : "Agendamento cancelado na agenda do remark";
  } else if (v.reason === "noite") {
    origin = "Horário noturno aberto pela clínica";
  } else {
    origin = "Horário vazio na agenda";
  }

  const steps: Step[] = [{ title: `${publishedAt} Publicada`, detail: origin, dot: "var(--teal)" }];
  if (v.alerted_count > 0) {
    steps.push({
      title: `${publishedAt} Primeira onda`,
      detail: v.alerted_count === 1 ? "1 paciente alertado" : `${v.alerted_count} pacientes alertados`,
      dot: "var(--teal)",
    });
  }
  if (v.status === "reservada") {
    const res = ctx.reservations[v.id];
    steps.push({
      title: res ? `${spTime(res.created_at)} Reservada` : "Reservada",
      detail: res ? `Sinal pago · ${brl(res.price_cents)}` : "Sinal pago",
      dot: "var(--amber-d)",
    });
  } else if (v.status === "expirada") {
    steps.push({ title: "Expirada", detail: "Ninguém reservou antes do horário", dot: "var(--line)", muted: true });
  } else {
    steps.push({ title: "Em andamento", detail: "Aguardando o sinal", dot: "var(--line)", muted: true });
  }

  return (
    <>
      <p className="small muted" style={{ marginBottom: 10 }}>
        {v.display_name}, {dayLabel} {spTime(v.starts_at)}
      </p>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <div key={s.title} style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.dot, marginTop: 6 }} />
              {last ? null : <span style={{ flex: 1, width: 2, background: "var(--line)" }} />}
            </div>
            <div style={last ? undefined : { paddingBottom: 14 }}>
              {s.muted ? <strong className="muted">{s.title}</strong> : <strong>{s.title}</strong>}
              <div className="small muted">{s.detail}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}
