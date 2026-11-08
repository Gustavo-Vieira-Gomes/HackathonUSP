import { Suspense } from "react";
import Link from "next/link";
import { getClinicExam } from "@/lib/data";
import { Screen, ScreenLoading } from "@/components/paciente/Screen";
import { ExamWarnings } from "@/components/paciente/ExamWarnings";
import { param, type SearchParams } from "@/components/paciente/helpers";

// Horário normal: agenda → antes de reservar → confirmar (sinal). Mesma etapa de avisos do encaixe.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AvisosNormalPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <AvisosNormal searchParams={searchParams} />
    </Suspense>
  );
}

async function AvisosNormal({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const examId = param(sp, "exame") ?? "";
  const horario = param(sp, "horario") ?? "";
  const lado = param(sp, "lado");
  const exam = UUID.test(examId) ? await getClinicExam(examId) : null;

  if (!exam || !exam.active || Number.isNaN(Date.parse(horario))) {
    return (
      <Screen style={{ padding: "24px 20px", gap: 14 }}>
        <h1 style={{ fontSize: 26 }}>Horário não encontrado</h1>
        <p className="muted">Volte e escolha de novo na agenda da clínica.</p>
        <Link className="btn btn-primary btn-block" href="/paciente">
          Voltar ao início
        </Link>
      </Screen>
    );
  }

  const query = new URLSearchParams({ exame: exam.id, horario, ...(lado ? { lado } : {}) }).toString();
  return (
    <ExamWarnings
      exam={exam}
      backHref={`/paciente/agenda/${exam.id}${lado ? `?lado=${lado}` : ""}`}
      backLabel="Voltar aos horários"
      nextHref={`/paciente/confirmar?${query}`}
    />
  );
}
