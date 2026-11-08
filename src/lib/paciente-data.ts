import "server-only";
// Leituras do app do paciente montadas sobre src/lib/data.ts.
import { connection } from "next/server";
import { db } from "@/lib/supabase";
import { getVacancy, type Reservation, type VacancyLive } from "@/lib/data";
import { examsHref, searchSide } from "@/components/paciente/helpers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vaga aberta para reserva, ou o motivo de não estar. */
export async function loadOpenVacancy(
  id: string,
  offerExamId?: string | null,
): Promise<{ vacancy: VacancyLive; gone: null; examsHref: string } | { vacancy: VacancyLive | null; gone: "reservada" | "expirada" | "missing"; examsHref: string }> {
  const offer = offerExamId && UUID.test(offerExamId) ? offerExamId : null;
  const vacancy = UUID.test(id) ? await getVacancy(id, offer) : null;
  const href = vacancy ? examsHref({ regionKey: vacancy.region_key, side: searchSide(vacancy.side) }) : "/paciente";
  if (!vacancy) return { vacancy: null, gone: "missing", examsHref: href };
  if (vacancy.status === "reservada" || vacancy.status === "expirada") return { vacancy, gone: vacancy.status, examsHref: href };
  return { vacancy, gone: null, examsHref: href };
}

/** Todas as reservas do paciente, inclusive as canceladas pela clínica (aba «Anteriores»). */
export async function listAllPatientReservations(patientId: string) {
  await connection();
  const { data, error } = await db()
    .from("reservations")
    .select("*, clinic_exam:clinic_exams(id, display_name, region_key, prep, full_price_cents, clinic:clinics(name, address))")
    .eq("patient_id", patientId)
    .order("starts_at");
  if (error) throw new Error(error.message);
  return data as unknown as (Reservation & {
    clinic_exam: { id: string; display_name: string; region_key: string; prep: string; full_price_cents: number; clinic: { name: string; address: string } };
  })[];
}
