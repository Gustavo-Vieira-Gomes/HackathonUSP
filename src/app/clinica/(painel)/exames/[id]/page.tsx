import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExamForm } from "@/components/clinica/ExamForm";
import { findRegion } from "@/lib/catalog";
import { getDemoNow, getDemoOffset, listClinicExams, listSubstituteIds } from "@/lib/data";
import "../exame-form.css";

type Params = Promise<{ id: string }>;

export default function EditarExamePage({ params }: { params: Params }) {
  return (
    <main className="clinic-main">
      <Suspense
        fallback={
          <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={{ fontSize: 36 }}>Editar exame</h1>
            <p className="muted">Carregando o exame…</p>
          </header>
        }
      >
        <EditarExame params={params} />
      </Suspense>
    </main>
  );
}

/** "há 2 dias", "há 3 h", "há poucos minutos". */
function editedAgo(updatedAt: string, realNowMs: number): string {
  const min = Math.max(0, Math.floor((realNowMs - Date.parse(updatedAt)) / 60_000));
  if (min < 2) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}

async function EditarExame({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [exams, demoNow, offset, substitutes] = await Promise.all([listClinicExams(), getDemoNow(), getDemoOffset(), listSubstituteIds(id)]);
  const exam = exams.find((e) => e.id === id);
  if (!exam) notFound();

  const found = findRegion(exam.region_key);
  const typeKey = found?.type.key ?? exam.region_key;
  const path = [typeKey];
  if (found && found.region.key !== found.type.key) path.push(found.region.key);
  if (exam.side) path.push(exam.side);

  // updated_at é o relógio real; o "agora" da demo está adiantado pelo offset.
  const realNow = demoNow.getTime() - offset * 3600_000;

  return (
    <ExamForm
      mode="edit"
      typeKey={typeKey}
      path={path}
      vacancies30d={exam.vacancies30d}
      reserved30d={exam.reserved30d}
      editedAgo={editedAgo(exam.updated_at, realNow)}
      options={exams.map((e) => ({ id: e.id, displayName: e.display_name, room: e.room, active: e.active, durationMin: e.duration_min }))}
      substitutes={substitutes}
      exam={{
        id: exam.id,
        regionKey: exam.region_key,
        side: exam.side,
        displayName: exam.display_name,
        tuss: exam.tuss,
        room: exam.room,
        fullCents: exam.full_price_cents,
        floorCents: exam.floor_price_cents,
        minNoticeHours: exam.min_notice_hours,
        prep: exam.prep,
        prepStarts: exam.prep_starts,
        lateToleranceMin: exam.late_tolerance_min,
        warnings: exam.warnings ?? [],
        active: exam.active,
        durationMin: exam.duration_min,
      }}
    />
  );
}
