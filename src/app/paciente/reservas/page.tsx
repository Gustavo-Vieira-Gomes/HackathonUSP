import { Suspense } from "react";
import Link from "next/link";
import { getDemoNow } from "@/lib/data";
import { listAllPatientReservations } from "@/lib/paciente-data";
import { currentPatientId } from "@/lib/session";
import { brl, relDay, spDay, spTime, TZ } from "@/lib/format";
import { sideSummary } from "@/lib/catalog";
import { TabBar } from "@/components/TabBar";
import { Screen, ScreenLoading } from "@/components/paciente/Screen";
import { ReservasTabs } from "@/components/paciente/ReservasTabs";
import "./reservas.css";

// Prancha Paciente-Reservas («Minhas reservas»): Próximas com a reserva em destaque e Anteriores.
export default function ReservasPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <Reservas />
    </Suspense>
  );
}

const WEEKDAY = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function monthShort(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, month: "short" }).format(new Date(iso)).replace(".", "");
}
function dayNum(iso: string) {
  return String(Number(spDay(iso).slice(8, 10)));
}
/** "Amanhã, 07:40" ou "Sexta, 13/11, 14:20", como na prancha. */
function quando(iso: string, now: Date) {
  const rel = relDay(iso, now);
  if (rel === "Hoje" || rel === "Amanhã") return `${rel}, ${spTime(iso)}`;
  const day = spDay(iso);
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return `${WEEKDAY[dow]}, ${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}, ${spTime(iso)}`;
}
function preparo(prep: string) {
  const base = prep && prep !== "Nenhum" ? `${prep.replace(/\.?\s*$/, ".")} ` : "";
  return `${base}Leve o pedido médico e um documento com foto.`;
}

function IconEncaixe() {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10M17 17V9M17 17H9" />
    </svg>
  );
}
function IconCal({ size }: { size?: number }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size } : undefined}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}

async function Reservas() {
  const patientId = await currentPatientId();
  const [rows, now] = await Promise.all([listAllPatientReservations(patientId), getDemoNow()]);
  const nowMs = now.getTime();

  const proximas = rows.filter((r) => r.status === "reservada" && Date.parse(r.starts_at) > nowMs);
  const anteriores = rows
    .filter((r) => r.status === "cancelada" || Date.parse(r.starts_at) <= nowMs)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  const p = proximas[0];
  const outras = proximas.slice(1);

  const proxPanel = p ? (
    <>
      <section aria-labelledby="t-prox" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 id="t-prox" className="small muted eyebrow">A próxima</h2>
        <article className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div className="when">
              <span className="m">{monthShort(p.starts_at)}</span>
              <span className="d">{dayNum(p.starts_at)}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                {p.kind === "encaixe" ? (
                  <span className="tag-enc"><IconEncaixe />Encaixe com desconto</span>
                ) : (
                  <span className="tag-nor"><IconCal />Horário normal</span>
                )}
                {p.confirmation === "pendente" ? (
                  <Link href="/paciente/whatsapp" className="chip st-alertando" style={{ textDecoration: "none" }}>Confirmar</Link>
                ) : p.confirmation === "confirmada" ? (
                  <span className="chip st-realizada">Confirmada</span>
                ) : (
                  <span className="chip st-reservada">Reservada</span>
                )}
              </div>
              <strong style={{ fontSize: 18, lineHeight: 1.25 }}>{p.clinic_exam.display_name}</strong>
              {sideSummary(p.clinic_exam.region_key, p.side) ? (
                <span className="small" style={{ fontWeight: 600, color: "var(--teal-d)" }}>{sideSummary(p.clinic_exam.region_key, p.side)}</span>
              ) : null}
              <span style={{ fontWeight: 600 }}>{quando(p.starts_at, now)}</span>
              <span className="small muted">
                {p.clinic_exam.clinic.name} · {p.clinic_exam.clinic.address}
              </span>
            </div>
          </div>
          <hr className="hr" />
          <div className="money">
            <span className="muted">Sinal pago pelo app</span>
            <span className="num" style={{ fontSize: 17 }}>{brl(p.deposit_cents, { decimals: true })}</span>
          </div>
          <div className="money">
            <span className="muted">Pagar na clínica</span>
            <span className="num" style={{ fontSize: 17 }}>{brl(p.price_cents - p.deposit_cents, { decimals: true })}</span>
          </div>
          <div className="panel" style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start", background: "var(--mint)", boxShadow: "none" }}>
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "var(--teal-d)", marginTop: 1 }}>
              <path d="M5 12l5 5 9-10" />
            </svg>
            <span className="small">{preparo(p.clinic_exam.prep)}</span>
          </div>
          <Link className="btn btn-primary btn-block" href={`/paciente/reservas/${p.id}`}>
            Ver detalhes da reserva
          </Link>
        </article>
      </section>

      {outras.length > 0 && (
        <section aria-labelledby="t-depois" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 id="t-depois" className="small muted eyebrow">Depois</h2>
          <div className="panel" style={{ overflow: "hidden" }}>
            {outras.map((r) => (
              <Link key={r.id} className="res-link" href={`/paciente/reservas/${r.id}`} aria-label={`Ver reserva de ${r.clinic_exam.display_name}, ${quando(r.starts_at, now)}`}>
                <div className="when">
                  <span className="m">{monthShort(r.starts_at)}</span>
                  <span className="d">{dayNum(r.starts_at)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <strong className="ellipsis" style={{ fontSize: 15 }}>{r.clinic_exam.display_name}</strong>
                  <span className="small">{quando(r.starts_at, now)}</span>
                  <span className="small muted ellipsis">
                    {r.clinic_exam.clinic.name} · {r.kind === "encaixe" ? "Encaixe" : "Horário normal"}
                  </span>
                </div>
                <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "var(--mute)" }}>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="small muted" style={{ padding: "0 4px" }}>
        Se a clínica cancelar, o sinal volta inteiro. Se você cancelar ou faltar, a clínica fica com ele.
      </p>
    </>
  ) : (
    <article className="card" style={{ padding: "22px 18px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
      <span style={{ width: 48, height: 48, borderRadius: 14, background: "var(--mint)", color: "var(--teal-d)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <IconCal size={24} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <strong style={{ fontSize: 18 }}>Nenhuma reserva marcada</strong>
        <p className="small" style={{ color: "var(--ink-2)" }}>
          Busque um exame para ver os encaixes com desconto e os horários normais das clínicas perto de você.
        </p>
      </div>
      <Link className="btn btn-primary btn-block" href="/paciente">
        Buscar exame
      </Link>
    </article>
  );

  const antPanel =
    anteriores.length > 0 ? (
      <div className="panel" style={{ overflow: "hidden" }}>
        {anteriores.map((r) => {
          const cancelada = r.status === "cancelada";
          const economia = r.clinic_exam.full_price_cents - r.price_cents;
          const nota = cancelada
            ? `Sinal de ${brl(r.deposit_cents, { decimals: true })} devolvido`
            : r.kind === "encaixe"
              ? `Encaixe por ${brl(r.price_cents)}${economia > 0 ? ` · você economizou ${brl(economia)}` : ""}`
              : `Horário normal por ${brl(r.price_cents)}`;
          const estado = cancelada ? (r.cancel_reason === "paciente" ? "Você cancelou" : r.cancel_reason === "sem_resposta" ? "Sem confirmação" : "Cancelada pela clínica") : "Realizada";
          return (
            <Link
              key={r.id}
              className="res-link"
              href={`/paciente/reservas/${r.id}`}
              aria-label={`${r.clinic_exam.display_name}, ${dayNum(r.starts_at)} de ${monthShort(r.starts_at)}, ${estado}`}
            >
              <div className="when past">
                <span className="m">{monthShort(r.starts_at)}</span>
                <span className="d">{dayNum(r.starts_at)}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <strong className="ellipsis" style={{ fontSize: 15 }}>{r.clinic_exam.display_name}</strong>
                <span className="small muted ellipsis">{r.clinic_exam.clinic.name}</span>
                <span className={cancelada ? "chip st-cancelada" : "chip st-realizada"} style={{ alignSelf: "flex-start", minHeight: 24, fontSize: 12 }}>
                  {estado}
                </span>
                <span className="small" style={{ color: "var(--ink-2)" }}>{nota}</span>
              </div>
            </Link>
          );
        })}
      </div>
    ) : (
      <p className="small muted" style={{ padding: "0 4px" }}>Nenhuma reserva anterior.</p>
    );

  return (
    <Screen className="scr-reservas" style={{ padding: "24px 20px 20px", gap: 16 }} footer={<TabBar />}>
      <h1 style={{ fontSize: 28 }}>Minhas reservas</h1>
      <ReservasTabs nProx={proximas.length} nAnt={anteriores.length} proximas={proxPanel} anteriores={antPanel} />
      <Link className="btn btn-ghost btn-block" href="/paciente">
        <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
        Buscar outro exame
      </Link>
    </Screen>
  );
}
