import { Suspense } from "react";
import Link from "next/link";
import { availability, getClinicExam, getDemoNow } from "@/lib/data";
import { spDay } from "@/lib/format";
import { Screen, ScreenLoading } from "@/components/paciente/Screen";
import { examsHref, param, searchSide, type SearchParams } from "@/components/paciente/helpers";
import { isPatientSide, sideForOffer, sideSummary } from "@/lib/catalog";
import { AgendaPicker } from "./AgendaPicker";
import "./agenda.css";

const DAYS = 45;

export default function AgendaPage({ params, searchParams }: { params: Promise<{ clinicExamId: string }>; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <Agenda params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Agenda({ params, searchParams }: { params: Promise<{ clinicExamId: string }>; searchParams: SearchParams }) {
  const [{ clinicExamId }, sp] = await Promise.all([params, searchParams]);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const exam = UUID.test(clinicExamId) ? await getClinicExam(clinicExamId) : null;
  const lado = param(sp, "lado");

  if (!exam || !exam.active) {
    return (
      <Screen className="scr-agenda" style={{ padding: "20px 20px 24px", gap: 14 }}>
        <h1 style={{ fontSize: 24 }}>Agenda indisponível</h1>
        <p className="muted">Esta clínica não oferece mais este exame. Volte e escolha outra.</p>
        <Link className="btn btn-primary btn-block" href="/paciente">
          Voltar ao início
        </Link>
      </Screen>
    );
  }

  const now = await getDemoNow();
  const today = spDay(now);
  const free = await availability(exam, today, DAYS, now);
  const side = isPatientSide(lado) ? lado : searchSide(exam.side);
  const summary = sideSummary(exam.region_key, sideForOffer(exam.side, side) ?? side);
  const back = examsHref({ regionKey: exam.region_key, side }, { aba: "normal" });

  return (
    <AgendaPicker
      examId={exam.id}
      title={`${exam.clinic.name} · ${exam.display_name}${summary ? ` · ${summary}` : ""}`}
      priceCents={exam.full_price_cents}
      today={today}
      free={free}
      backHref={back}
      lado={side}
      slotMin={exam.duration_min}
    />
  );
}
