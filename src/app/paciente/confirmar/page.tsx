import { Suspense } from "react";
import Link from "next/link";
import { DEPOSIT_RATE, getClinicExam, getDemoNow, listOpenVacancies } from "@/lib/data";
import { brl, longDay, spDay, spTime } from "@/lib/format";
import { BackLink, Screen, ScreenLoading, StepHeader } from "@/components/paciente/Screen";
import { param, searchSide, vagaHref, type SearchParams } from "@/components/paciente/helpers";
import { findRegion, isPatientSide, sideForOffer, sideSummary } from "@/lib/catalog";
import { ConfirmNormal } from "./ConfirmNormal";
import "./confirmar.css";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ConfirmarPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <Confirmar searchParams={searchParams} />
    </Suspense>
  );
}

async function Confirmar({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const examId = param(sp, "exame") ?? "";
  const horario = param(sp, "horario") ?? "";
  const lado = param(sp, "lado");
  const startsMs = Date.parse(horario);
  const exam = UUID.test(examId) ? await getClinicExam(examId) : null;

  if (!exam || !exam.active || Number.isNaN(startsMs)) {
    return (
      <Screen className="scr-confirmar" style={{ padding: "20px 20px 24px", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BackLink href="/paciente" label="Voltar ao início" />
          <h1 style={{ fontSize: 26 }}>Confirmar horário</h1>
        </div>
        <p className="muted">Não encontramos este horário. Volte e escolha de novo na agenda da clínica.</p>
        <Link className="btn btn-primary btn-block" href="/paciente">
          Voltar ao início
        </Link>
      </Screen>
    );
  }

  const starts = new Date(startsMs).toISOString();
  const day = spDay(starts);
  const now = await getDemoNow();
  const side = isPatientSide(lado) ? lado : searchSide(exam.side);
  const bookedSide = sideForOffer(exam.side, side);
  const summary = sideSummary(exam.region_key, bookedSide ?? side);
  const checkExtent = !!findRegion(exam.region_key)?.region.checkExtent;
  // Encaixe mais barato da mesma região no mesmo dia.
  const cheaper = (await listOpenVacancies({ regionKey: exam.region_key, side }))
    .filter((v) => spDay(v.starts_at) === day && v.price_cents < exam.full_price_cents)
    .sort((a, b) => a.price_cents - b.price_cents)[0];
  const deposit = Math.round(exam.full_price_cents * DEPOSIT_RATE);
  const avisosHref = `/paciente/confirmar/avisos?${new URLSearchParams({ exame: exam.id, horario: starts, ...(lado ? { lado } : {}) })}`;
  const weekday = longDay(day).split(",")[0];

  return (
    <Screen className="scr-confirmar" style={{ padding: "20px 20px 24px", gap: 14 }}>
      <StepHeader backHref={avisosHref} backLabel="Voltar aos avisos" step={2} total={2} />
      <h1 style={{ fontSize: 26 }}>Confirmar horário</h1>

      <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <strong style={{ fontSize: 18 }}>{exam.display_name}</strong>
            <div className="muted">
              {exam.clinic.name} · {exam.clinic.address}
            </div>
          </div>
          <span className="chip st-expirada">Horário normal</span>
        </div>
        <hr className="hr" />
        <div className="row">
          <span className="k">Quando</span>
          <span className="v">
            <strong>
              {longDay(day)}, {spTime(starts)}
            </strong>
          </span>
        </div>
        {summary ? (
          <div className="row">
            <span className="k">Lado</span>
            <span className="v">{summary}</span>
          </div>
        ) : null}
        <div className="row">
          <span className="k">Preparo</span>
          <span className="v">{exam.prep}</span>
        </div>
        <hr className="hr" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="muted">Preço do exame</span>
          <span className="num" style={{ fontSize: 36 }}>
            {brl(exam.full_price_cents)}
          </span>
        </div>
      </div>

      {cheaper && (
        <Link
          href={vagaHref(cheaper, "", side)}
          className="panel"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 14px", textDecoration: "none", color: "inherit", background: "var(--amber-s)", boxShadow: "none", minHeight: 56 }}
        >
          <span>
            <strong>Tem encaixe mais barato neste dia</strong>
            <span className="small" style={{ display: "block", color: "#17363a" }}>
              {weekday} às {spTime(cheaper.starts_at)} por {brl(cheaper.price_cents)}
              {cheaper.clinic_id !== exam.clinic_id ? ` · ${cheaper.clinic_name}` : ""}
            </span>
          </span>
          <span className="btn btn-sm" style={{ background: "var(--amber)", color: "var(--ink)" }}>
            Ver
          </span>
        </Link>
      )}

      <ConfirmNormal examId={exam.id} startsAt={starts} depositLabel={brl(deposit, { decimals: true })} pct={Math.round(DEPOSIT_RATE * 100)} past={startsMs <= now.getTime()} side={bookedSide} />
      {checkExtent || bookedSide === null && summary ? (
        <p className="small muted" style={{ padding: "0 4px" }}>
          {checkExtent ? "A clínica confere a extensão exata com o seu pedido antes da reserva definitiva." : "A clínica confere o lado no seu pedido médico antes do exame."}
        </p>
      ) : null}
    </Screen>
  );
}
