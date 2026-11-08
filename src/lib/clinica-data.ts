import "server-only";
import { connection } from "next/server";
import { db } from "./supabase";

// Consultas só do painel da clínica, que não cabem nas funções compartilhadas de data.ts.

export type VacancyContext = {
  /** Reserva ativa de cada vaga reservada: preço pago e quando o sinal foi pago. */
  reservations: Record<string, { price_cents: number; created_at: string }>;
  /** Origem do evento da agenda que virou vaga (google ou manual). */
  eventSources: Record<string, "google" | "manual">;
};

export async function getVacancyContext(vacancies: { id: string; event_id: string | null }[]): Promise<VacancyContext> {
  await connection();
  const ids = vacancies.map((v) => v.id);
  const eventIds = vacancies.map((v) => v.event_id).filter((id): id is string => !!id);
  if (ids.length === 0) return { reservations: {}, eventSources: {} };
  const [res, ev] = await Promise.all([
    db().from("reservations").select("vacancy_id, price_cents, created_at").eq("status", "reservada").in("vacancy_id", ids),
    eventIds.length
      ? db().from("calendar_events").select("id, source").in("id", eventIds)
      : Promise.resolve({ data: [] as { id: string; source: "google" | "manual" }[], error: null }),
  ]);
  if (res.error) throw new Error(res.error.message);
  if (ev.error) throw new Error(ev.error.message);
  const reservations: VacancyContext["reservations"] = {};
  for (const r of (res.data ?? []) as { vacancy_id: string; price_cents: number; created_at: string }[]) {
    reservations[r.vacancy_id] = { price_cents: r.price_cents, created_at: r.created_at };
  }
  const eventSources: VacancyContext["eventSources"] = {};
  for (const e of (ev.data ?? []) as { id: string; source: "google" | "manual" }[]) eventSources[e.id] = e.source;
  return { reservations, eventSources };
}

/** Nomes dos substitutos ativos de cada exame: o horário cancelado vira vaga também para eles. */
export async function listSubstituteNames(examIds: string[]): Promise<Record<string, string[]>> {
  await connection();
  if (examIds.length === 0) return {};
  const { data, error } = await db()
    .from("clinic_exam_substitutes")
    .select("clinic_exam_id, substitute:clinic_exams!clinic_exam_substitutes_substitute_id_fkey(display_name, active, deleted_at)")
    .in("clinic_exam_id", [...new Set(examIds)]);
  if (error) throw new Error(error.message);
  const out: Record<string, string[]> = {};
  for (const row of (data ?? []) as unknown as { clinic_exam_id: string; substitute: { display_name: string; active: boolean; deleted_at: string | null } | null }[]) {
    if (!row.substitute || !row.substitute.active || row.substitute.deleted_at) continue;
    (out[row.clinic_exam_id] ??= []).push(row.substitute.display_name);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return out;
}
