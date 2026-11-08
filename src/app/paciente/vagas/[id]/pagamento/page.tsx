import { Suspense } from "react";
import { DEPOSIT_RATE } from "@/lib/data";
import { loadOpenVacancy } from "@/lib/paciente-data";
import { brl } from "@/lib/format";
import { ScreenLoading } from "@/components/paciente/Screen";
import { VacancyGone } from "@/components/paciente/VacancyGone";
import { PaymentForm } from "./PaymentForm";
import { vagaHref } from "@/components/paciente/helpers";
import { isPatientSide, sideForOffer, sideSummary } from "@/lib/catalog";
import "./pagamento.css";

export default function PagamentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ exame?: string; lado?: string }> }) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <Pagamento params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Pix copia e cola simulado, no formato do BR Code. */
function pixCode(amountCents: number, merchant: string): string {
  const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;
  const amount = (amountCents / 100).toFixed(2);
  const name = merchant.normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 25);
  return (
    "00020126580014br.gov.bcb.pix0136exemplo-simulado-0000-0000-0000520400005303986" +
    field("54", amount) +
    "5802BR" +
    field("59", name) +
    "6009SAO PAULO"
  );
}

async function Pagamento({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ exame?: string; lado?: string }> }) {
  const [{ id }, { exame, lado }] = await Promise.all([params, searchParams]);
  const { vacancy: v, gone, examsHref } = await loadOpenVacancy(id, exame);
  if (gone || !v) return <VacancyGone status={gone ?? "missing"} examsHref={examsHref} />;

  const deposit = Math.round(v.price_cents * DEPOSIT_RATE);
  return (
    <PaymentForm
      vacancyId={v.id}
      offerExamId={v.is_substitute ? v.clinic_exam_id : null}
      backHref={vagaHref(v, "/avisos", lado)}
      side={sideForOffer(v.side, lado)}
      examLabel={v.display_name}
      summary={sideSummary(v.region_key, sideForOffer(v.side, lado) ?? (isPatientSide(lado) ? lado : null))}
      pct={Math.round(DEPOSIT_RATE * 100)}
      deposit={brl(deposit, { decimals: true })}
      price={brl(v.price_cents, { decimals: true })}
      rest={brl(v.price_cents - deposit, { decimals: true })}
      pix={pixCode(deposit, v.clinic_name)}
    />
  );
}
