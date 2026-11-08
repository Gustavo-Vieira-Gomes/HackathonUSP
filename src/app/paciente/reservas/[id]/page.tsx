import { Suspense } from "react";
import Link from "next/link";
import { getDemoNow, getReservation } from "@/lib/data";
import { currentPatientId } from "@/lib/session";
import { brl, relDay, spTime } from "@/lib/format";
import { sideSummary } from "@/lib/catalog";
import { Screen, ScreenLoading } from "@/components/paciente/Screen";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ReservaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <Reserva params={params} />
    </Suspense>
  );
}

async function Reserva({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [reservation, patientId, now] = await Promise.all([UUID.test(id) ? getReservation(id) : null, currentPatientId(), getDemoNow()]);

  if (reservation && reservation.patient_id === patientId && reservation.status === "cancelada") {
    const exam = reservation.clinic_exam;
    return (
      <Screen style={{ padding: "24px 20px", gap: 14 }}>
        <h1 style={{ fontSize: 28 }}>Reserva cancelada</h1>
        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <strong style={{ fontSize: 18 }}>{exam.display_name}</strong>
              <div className="muted">{exam.clinic.name}</div>
            </div>
            <span className="chip st-cancelada">Cancelada pela clínica</span>
          </div>
          <hr className="hr" />
          <div className="row">
            <span className="k">Era em</span>
            <span className="v">
              <strong>
                {relDay(reservation.starts_at, now)}, {spTime(reservation.starts_at)}
              </strong>
            </span>
          </div>
          <div className="row">
            <span className="k">Sinal</span>
            <span className="v">{brl(reservation.deposit_cents, { decimals: true })} devolvido inteiro</span>
          </div>
        </div>
        <Link className="btn btn-primary btn-block" href="/paciente">
          Buscar outro horário
        </Link>
        <Link className="btn btn-ghost btn-block" href="/paciente/reservas">
          Ver minhas reservas
        </Link>
      </Screen>
    );
  }

  if (!reservation || reservation.patient_id !== patientId || reservation.status !== "reservada") {
    return (
      <Screen style={{ padding: "24px 20px", gap: 14 }}>
        <h1 style={{ fontSize: 28 }}>Reserva não encontrada</h1>
        <p className="muted">Esta reserva não existe, foi cancelada ou é de outra pessoa.</p>
        <Link className="btn btn-primary btn-block" href="/paciente/reservas">
          Ver minhas reservas
        </Link>
      </Screen>
    );
  }

  const exam = reservation.clinic_exam;
  const deposit = brl(reservation.deposit_cents, { decimals: true });
  const rest = brl(reservation.price_cents - reservation.deposit_cents, { decimals: true });
  const done = Date.parse(reservation.starts_at) <= now.getTime();

  return (
    <Screen>
      <div style={{ background: "var(--teal)", color: "#fff", padding: "28px 24px 56px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14, flex: "none" }}>
        <div className="pop" style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--amber)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#17363a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path className="check-path" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h1 style={{ fontSize: 34 }}>{reservation.kind === "encaixe" ? "Vaga reservada" : "Horário reservado"}</h1>
        <p style={{ opacity: 0.92 }}>Sinal de {deposit} pago. Mandamos a confirmação para o seu e-mail.</p>
      </div>

      <div style={{ margin: "-32px 16px 0", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <strong style={{ fontSize: 18 }}>{exam.display_name}</strong>
              <div className="muted">{exam.clinic.name}</div>
            </div>
            <span className={done ? "chip st-realizada" : "chip st-reservada"}>{done ? "Realizada" : "Reservada"}</span>
          </div>
          <hr className="hr" />
          <div className="row">
            <span className="k">Quando</span>
            <span className="v">
              <strong>
                {relDay(reservation.starts_at, now)}, {spTime(reservation.starts_at)}
              </strong>
            </span>
          </div>
          {sideSummary(exam.region_key, reservation.side) ? (
            <div className="row">
              <span className="k">Lado</span>
              <span className="v">{sideSummary(exam.region_key, reservation.side)}</span>
            </div>
          ) : null}
          <div className="row">
            <span className="k">Onde</span>
            <span className="v">{exam.clinic.address}</span>
          </div>
          <div className="row">
            <span className="k">Levar</span>
            <span className="v">Pedido médico e documento com foto</span>
          </div>
          <div className="row">
            <span className="k">Preparo</span>
            <span className="v">{exam.prep}</span>
          </div>
          <hr className="hr" />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="muted">Pago agora</span>
            <span className="num" style={{ fontSize: 18 }}>
              {deposit}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="muted">Pagar na clínica</span>
            <span className="num" style={{ fontSize: 18 }}>
              {rest}
            </span>
          </div>
        </div>

        <p className="small muted" style={{ padding: "0 6px" }}>
          Se a clínica cancelar, o sinal volta inteiro. Se você cancelar ou faltar, a clínica fica com ele.
        </p>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 24 }}>
          <Link className="btn btn-primary btn-block" href="/paciente/reservas">
            Ver minhas reservas
          </Link>
          <Link className="btn btn-ghost btn-block" href="/paciente">
            Voltar ao início
          </Link>
        </div>
      </div>
    </Screen>
  );
}
