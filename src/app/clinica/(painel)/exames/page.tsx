import Link from "next/link";
import { Suspense } from "react";
import { ExamsTable, type ExamRow } from "@/components/clinica/ExamsTable";
import { IconPlus } from "@/components/icons";
import { clinicSideLabel, findRegion } from "@/lib/catalog";
import { listClinicExams } from "@/lib/data";
import "./exames.css";

export default function ExamesPage() {
  return (
    <main className="clinic-main" style={{ gap: 20 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 style={{ fontSize: 36 }}>Exames</h1>
          <p className="muted">Os exames que a clínica oferece no remark, com o preço cheio e o piso de cada um.</p>
        </div>
        <Link className="btn btn-primary" href="/clinica/exames/novo">
          <IconPlus />
          Novo exame
        </Link>
      </header>

      <Suspense fallback={<p className="muted">Carregando os exames…</p>}>
        <Exams />
      </Suspense>

      <p className="small muted">Exame pausado não recebe vagas de encaixe, mas segue na agenda.</p>
    </main>
  );
}

async function Exams() {
  const exams = await listClinicExams();
  const rows: ExamRow[] = exams.map((e) => {
    const found = findRegion(e.region_key);
    const side = clinicSideLabel(e.region_key, e.side);
    const tipo = [found?.type.label, found && found.region.key !== found.type.key ? found.region.label : null, side].filter(Boolean).join(" · ");
    return {
      id: e.id,
      nome: e.display_name,
      tipo,
      tuss: e.tuss,
      sala: e.room,
      cheioCents: e.full_price_cents,
      pisoCents: e.floor_price_cents,
      antec: `${e.min_notice_hours} h`,
      vagas: e.vacancies30d,
      ativo: e.active,
    };
  });
  return <ExamsTable exams={rows} />;
}
