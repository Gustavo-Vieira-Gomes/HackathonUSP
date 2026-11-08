import { Suspense } from "react";
import { ExamForm } from "@/components/clinica/ExamForm";
import { listClinicExams } from "@/lib/data";
import "../exame-form.css";

export default function NovoExamePage() {
  return (
    <main className="clinic-main">
      <Suspense
        fallback={
          <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={{ fontSize: 36 }}>Novo exame</h1>
            <p className="muted">Carregando…</p>
          </header>
        }
      >
        <NovoExame />
      </Suspense>
    </main>
  );
}

async function NovoExame() {
  const exams = await listClinicExams();
  return <ExamForm mode="new" options={exams.map((e) => ({ id: e.id, displayName: e.display_name, room: e.room, active: e.active, durationMin: e.duration_min }))} />;
}
