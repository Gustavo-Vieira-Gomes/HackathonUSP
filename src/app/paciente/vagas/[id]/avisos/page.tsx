import { Suspense } from "react";
import { loadOpenVacancy } from "@/lib/paciente-data";
import { ScreenLoading } from "@/components/paciente/Screen";
import { VacancyGone } from "@/components/paciente/VacancyGone";
import { ExamWarnings } from "@/components/paciente/ExamWarnings";
import { vagaHref } from "@/components/paciente/helpers";

// Encaixe: vaga → antes de reservar → sinal.
export default function AvisosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ exame?: string; lado?: string }> }) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <Avisos params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Avisos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ exame?: string; lado?: string }> }) {
  const [{ id }, { exame, lado }] = await Promise.all([params, searchParams]);
  const { vacancy: v, gone, examsHref } = await loadOpenVacancy(id, exame);
  if (gone || !v) return <VacancyGone status={gone ?? "missing"} examsHref={examsHref} />;

  return <ExamWarnings exam={v} backHref={vagaHref(v, "", lado)} backLabel="Voltar para a vaga" nextHref={vagaHref(v, "/pagamento", lado)} />;
}
