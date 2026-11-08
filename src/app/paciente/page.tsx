import { Suspense } from "react";
import Link from "next/link";
import { getDemoNow, getPatient, listOpenVacancies, listPatientReservations, listWaitlist, type VacancyLive } from "@/lib/data";
import { currentPatientId } from "@/lib/session";
import { PatientHeader } from "@/components/paciente/PatientHeader";
import { brl, relDay, spTime } from "@/lib/format";
import { TabBar } from "@/components/TabBar";
import { Screen, ScreenLoading } from "@/components/paciente/Screen";
import { ExamPicker } from "@/components/paciente/ExamPicker";
import { discountPct, vagaHref } from "@/components/paciente/helpers";
import "./inicio.css";

export default function InicioPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <Inicio />
    </Suspense>
  );
}

async function Inicio() {
  const patientId = await currentPatientId();
  const [patient, reservations, waitlist, now] = await Promise.all([
    getPatient(patientId),
    listPatientReservations(patientId),
    listWaitlist(patientId),
    getDemoNow(),
  ]);
  const next = reservations.find((r) => Date.parse(r.starts_at) > now.getTime()) ?? null;
  const activeWaitlist = waitlist.filter((w) => Date.parse(w.expires_at) > now.getTime());

  // Vaga aberta que atende um aviso ativo: mesma busca, dentro da distância e do preço máximo.
  const matches = await Promise.all(
    activeWaitlist.map(async (w) => {
      const open = await listOpenVacancies({ regionKey: w.region_key, side: w.side });
      return open.filter((v) => v.price_cents <= w.max_price_cents && v.distance_km <= w.radius_km);
    }),
  );
  const match: VacancyLive | undefined = matches.flat().sort((a, b) => a.price_cents - b.price_cents)[0];

  return (
    <Screen
      className="scr-inicio"
      style={{ padding: "20px 20px 12px", gap: 18 }}
      header={<PatientHeader patient={patient ? { name: patient.name, email: patient.email, phone: patient.phone } : null} />}
      footer={<TabBar />}
    >
      <h1 className="sr-only">Início</h1>

      {match && (
        <Link href={vagaHref(match)} className="match rise" aria-label={`Vaga para você: ${match.display_name}, ${relDay(match.starts_at, now)} às ${spTime(match.starts_at)}, ${brl(match.price_cents)}`}>
          <span className="chip st-alertando" style={{ alignSelf: "flex-start" }}>
            Vaga para você
          </span>
          <span style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <strong style={{ fontSize: 17 }}>{match.display_name}</strong>
              <span className="small" style={{ color: "var(--ink-2)" }}>
                {relDay(match.starts_at, now)}, {spTime(match.starts_at)} · {match.clinic_name}
              </span>
            </span>
            <span style={{ textAlign: "right", flex: "none" }}>
              {match.price_cents < match.full_price_cents && (
                <span className="small muted" style={{ display: "block", textDecoration: "line-through" }}>
                  {brl(match.full_price_cents)}
                </span>
              )}
              <span className="num" style={{ display: "block", fontSize: 30, lineHeight: 1 }}>
                {brl(match.price_cents)}
              </span>
            </span>
          </span>
          {match.price_cents < match.full_price_cents && (
            <span className="small" style={{ fontWeight: 600, color: "var(--teal-d)" }}>
              {discountPct(match.price_cents, match.full_price_cents)}% abaixo do preço cheio · ver a vaga
            </span>
          )}
        </Link>
      )}

      <ExamPicker />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 20 }}>Próxima reserva</h2>
        {next ? (
          <Link href={`/paciente/reservas/${next.id}`} className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <strong>{next.clinic_exam.display_name}</strong>
              <span className="chip st-reservada">Reservada</span>
            </div>
            <div className="small muted">
              {relDay(next.starts_at, now)}, {spTime(next.starts_at)} · {next.clinic_exam.clinic.name}
            </div>
          </Link>
        ) : (
          <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <strong>Nenhuma reserva marcada</strong>
            <div className="small muted">Escolha um exame acima para ver horários e preços.</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 20 }}>Seus avisos de vaga</h2>
        {activeWaitlist.length === 0 ? (
          <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 2 }}>
            <strong>Nenhum aviso ativo</strong>
            <div className="small muted">Crie um aviso e mandamos mensagem quando abrir vaga com desconto.</div>
          </div>
        ) : (
          activeWaitlist.map((w) => {
            const days = Math.max(1, Math.ceil((Date.parse(w.expires_at) - now.getTime()) / 86400000));
            return (
              <div key={w.id} className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong>{w.exam_label}</strong>
                  <span className="chip st-publicada">Ativo</span>
                </div>
                <div className="small muted">
                  Até {w.radius_km} km · até {brl(w.max_price_cents)} · vale por mais {days} {days === 1 ? "dia" : "dias"}
                </div>
              </div>
            );
          })
        )}
        <Link className="btn btn-ghost btn-block" href="/paciente/aviso">
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7z" />
            <path d="M10 20h4" />
          </svg>
          Criar aviso de vaga
        </Link>
      </div>
    </Screen>
  );
}
