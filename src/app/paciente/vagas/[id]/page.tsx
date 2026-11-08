import { Suspense } from "react";
import Link from "next/link";
import { DEPOSIT_RATE, getDemoNow } from "@/lib/data";
import { brl, relDay, spTime } from "@/lib/format";
import { Screen, ScreenLoading } from "@/components/paciente/Screen";
import { Countdown } from "@/components/paciente/Countdown";
import { VacancyGone } from "@/components/paciente/VacancyGone";
import { discountPct, priceSteps, splitPrep, vagaHref } from "@/components/paciente/helpers";
import { loadOpenVacancy } from "@/lib/paciente-data";
import { isPatientSide, sideForOffer, sideSummary } from "@/lib/catalog";

const HEIGHTS = [100, 82, 64, 46];

export default function VagaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ exame?: string; lado?: string }> }) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <Vaga params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Vaga({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ exame?: string; lado?: string }> }) {
  const [{ id }, { exame, lado }] = await Promise.all([params, searchParams]);
  const { vacancy: v, gone, examsHref } = await loadOpenVacancy(id, exame);
  if (gone || !v) return <VacancyGone status={gone ?? "missing"} examsHref={examsHref} />;

  const now = await getDemoNow();
  // Lado e abrangência acompanham a reserva até a confirmação.
  const bookedSide = sideForOffer(v.side, lado);
  const summary = sideSummary(v.region_key, bookedSide ?? (isPatientSide(lado) ? lado : null));
  const steps = priceSteps(v.full_price_cents, v.floor_price_cents);
  const step = Math.min(3, Math.max(0, v.step));
  const saving = v.full_price_cents - v.price_cents;
  const deposit = Math.round(v.price_cents * DEPOSIT_RATE);
  const [prepTitle, prepDetail] = splitPrep(v.prep);
  const km = v.distance_km.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  return (
    <Screen style={{ padding: "20px 20px 24px", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 36 }}>
        <span className="chip st-alertando">Vaga para você</span>
        <span className="small" style={{ fontWeight: 600 }}>
          Reserve em <Countdown style={{ fontSize: 17 }} />
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 style={{ fontSize: 32 }}>{v.display_name}</h1>
        {summary ? (
          <span style={{ fontWeight: 700, color: "var(--teal-d)" }}>{summary}</span>
        ) : null}
        <p className="muted">
          {v.clinic_name} · {km} km de você
        </p>
      </div>

      <div className="card" style={{ padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            {saving > 0 && (
              <div className="small muted" style={{ textDecoration: "line-through" }}>
                {brl(v.full_price_cents)}
              </div>
            )}
            <div className="num drop-a" style={{ fontSize: 60, lineHeight: 1 }}>
              {brl(v.price_cents)}
            </div>
          </div>
          <div style={{ textAlign: "right", paddingBottom: 6 }}>
            <div className="small muted">Você economiza</div>
            <div className="num" style={{ fontSize: 22, color: "var(--teal-d)" }}>
              {brl(saving)}
            </div>
          </div>
        </div>
        <div className="stairs" style={{ height: 64 }} role="img" aria-label={`Escada de preço: degrau ${step + 1} de 4, ${brl(v.price_cents)}`}>
          {steps.map((p, i) => {
            const off = discountPct(p, v.full_price_cents);
            return (
              <div key={i} className={i === step ? "bar on" : i < step ? "bar past" : "bar"} style={{ height: `${HEIGHTS[i]}%` }}>
                <span>{off > 0 ? `−${off}%` : "0%"}</span>
              </div>
            );
          })}
        </div>
        <p className="small muted">O preço desce a cada degrau e nunca sobe. Você paga o valor do momento do pagamento.</p>
      </div>

      <div className="panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row">
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <div className="v">
            <strong>
              {relDay(v.starts_at, now)}, {spTime(v.starts_at)}
            </strong>
            <div className="small muted">Duração de cerca de {v.duration_min} minutos</div>
          </div>
        </div>
        <div className="row">
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <div className="v">
            <strong>{v.clinic_address}</strong>
            <div className="small muted">
              {v.clinic_name} · {v.agency_name}
            </div>
          </div>
        </div>
        <div className="row">
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 4h6l1 2h3v14H5V6h3z" />
            <path d="M9 13l2 2 4-4" />
          </svg>
          <div className="v">
            <strong>{prepTitle}</strong>
            <div className="small muted">{prepDetail ?? "Preparo do exame"}</div>
          </div>
        </div>
      </div>

      <p className="small muted" style={{ padding: "0 4px" }}>
        {v.alerted_count > 0 ? `Avisamos ${v.alerted_count} ${v.alerted_count === 1 ? "pessoa" : "pessoas"}. ` : ""}Quem pagar o sinal primeiro fica com a vaga.
      </p>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link className="btn btn-primary btn-block" href={vagaHref(v, "/avisos", lado)}>
          Quero esta vaga
          <span style={{ fontWeight: 500, opacity: 0.9 }}>· sinal {brl(deposit, { decimals: true })}</span>
        </Link>
        <Link className="btn btn-ghost btn-block" href="/paciente">
          Agora não
        </Link>
      </div>
    </Screen>
  );
}
