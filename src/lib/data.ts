import "server-only";
import { connection } from "next/server";
import { db } from "./supabase";
import { offerMatches } from "./catalog";
import { addDays, spDay, spInstant, spMinutes } from "./format";

export const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_PATIENT_ID = "22222222-2222-4222-8222-222222222222";
export const ROOMS = ["Ressonância", "Tomografia", "Ultrassom", "Mamografia"] as const;
export const DEPOSIT_RATE = 0.2;

// Agenda de horário normal: das 07:00 às 19:00, a cada 40 minutos.
const DAY_START_MIN = 7 * 60;
const DAY_END_MIN = 19 * 60;
const SLOT_MIN = 40;

export type VacancyLive = {
  id: string;
  clinic_exam_id: string;
  event_id: string | null;
  starts_at: string;
  duration_min: number;
  reason: "cancelamento" | "noite" | "vazio";
  alerted_count: number;
  published_at: string;
  display_name: string;
  region_key: string;
  side: string | null;
  room: string;
  full_price_cents: number;
  floor_price_cents: number;
  warnings: string[];
  prep: string;
  clinic_id: string;
  clinic_name: string;
  clinic_address: string;
  distance_km: number;
  agency_name: string;
  hours_left: number;
  step: number;
  price_cents: number;
  status: "publicada" | "alertando" | "reservada" | "expirada";
  /** Só nas ofertas (view vacancy_offers): exame dono do horário e se esta oferta é um substituto dele. */
  vacancy_exam_id?: string;
  is_substitute?: boolean;
  vacancy_display_name?: string;
};

export type ClinicExam = {
  id: string;
  clinic_id: string;
  region_key: string;
  side: string | null;
  display_name: string;
  tuss: string | null;
  room: string;
  full_price_cents: number;
  floor_price_cents: number;
  min_notice_hours: number;
  prep: string;
  prep_starts: string;
  late_tolerance_min: number;
  warnings: string[];
  active: boolean;
  updated_at: string;
  /** Duração do exame em minutos (bilateral costuma ser maior). */
  duration_min: number;
  clinic: { id: string; name: string; address: string; distance_km: number; agency: { name: string } };
};

export type CalendarEvent = {
  id: string;
  room: string;
  starts_at: string;
  ends_at: string;
  kind: "patient" | "block";
  title: string;
  detail: string | null;
  source: "google" | "manual";
  clinic_exam_id: string | null;
  cancelled_at: string | null;
};

export type Reservation = {
  id: string;
  patient_id: string;
  clinic_exam_id: string;
  vacancy_id: string | null;
  starts_at: string;
  kind: "encaixe" | "normal";
  price_cents: number;
  deposit_cents: number;
  payment_method: "pix" | "card";
  status: "reservada" | "cancelada";
  created_at: string;
  /** Lado pedido: esquerdo, direito, ambos (bilateral) ou null (a conferir no pedido). */
  side: "esquerdo" | "direito" | "ambos" | null;
};

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const CLINIC_EXAM_SELECT =
  "id, clinic_id, region_key, side, display_name, tuss, room, full_price_cents, floor_price_cents, min_notice_hours, prep, prep_starts, late_tolerance_min, warnings, active, updated_at, duration_min, clinic:clinics(id, name, address, distance_km, agency:agencies(name))";

// ---------- Relógio da demo ----------

export async function getDemoNow(): Promise<Date> {
  await connection();
  const iso = must(await db().rpc("demo_now")) as string;
  return new Date(iso);
}

export async function getDemoOffset(): Promise<number> {
  await connection();
  const row = must(await db().from("demo_settings").select("offset_hours").eq("id", 1).single()) as { offset_hours: number };
  return row.offset_hours;
}

// ---------- Paciente ----------

export async function getPatient(id: string) {
  await connection();
  const rows = must(await db().rpc("get_patient", { p_id: id })) as { id: string; name: string; email: string | null; phone: string | null }[];
  return rows[0] ?? null;
}

export async function listOpenVacancies(search: { regionKey: string; side?: string | null }): Promise<VacancyLive[]> {
  await connection();
  // Ofertas: a vaga aparece para o exame dela e para os substitutos que a clínica marcou.
  const rows = must(
    await db().from("vacancy_offers").select("*").eq("region_key", search.regionKey).in("status", ["publicada", "alertando"]),
  ) as VacancyLive[];
  const best = new Map<string, VacancyLive>();
  for (const v of rows.filter((r) => offerMatches(r, search))) {
    const cur = best.get(v.id);
    if (!cur || v.price_cents < cur.price_cents || (cur.is_substitute && !v.is_substitute)) best.set(v.id, v);
  }
  return [...best.values()]
    .map((v) => ({ ...v, hours_left: Number(v.hours_left), distance_km: Number(v.distance_km) }))
    .sort((a, b) => a.price_cents - b.price_cents || a.starts_at.localeCompare(b.starts_at));
}

/** Uma vaga como oferta: do próprio exame (padrão) ou de um substituto (`offerExamId`). */
export async function getVacancy(id: string, offerExamId?: string | null): Promise<VacancyLive | null> {
  await connection();
  let q = db().from("vacancy_offers").select("*").eq("id", id);
  q = offerExamId ? q.eq("clinic_exam_id", offerExamId) : q.eq("is_substitute", false);
  const row = must(await q.maybeSingle()) as VacancyLive | null;
  return row ? { ...row, hours_left: Number(row.hours_left), distance_km: Number(row.distance_km) } : null;
}

export async function getClinicExam(id: string): Promise<ClinicExam | null> {
  await connection();
  return must(await db().from("clinic_exams").select(CLINIC_EXAM_SELECT).eq("id", id).maybeSingle()) as unknown as ClinicExam | null;
}

/** Ofertas de horário normal (preço cheio) que atendem a busca, com a próxima data livre. */
export async function listOffers(search: { regionKey: string; side?: string | null }) {
  await connection();
  const exams = must(
    await db().from("clinic_exams").select(CLINIC_EXAM_SELECT).eq("region_key", search.regionKey).eq("active", true),
  ) as unknown as ClinicExam[];
  const matching = exams.filter((e) => offerMatches(e, search));
  const now = await getDemoNow();
  const withNext = await Promise.all(
    matching.map(async (e) => {
      const avail = await availability(e, spDay(now), 21, now);
      const next = Object.keys(avail).sort().find((d) => avail[d].length > 0) ?? null;
      return { exam: e, nextFreeDay: next };
    }),
  );
  return withNext.sort((a, b) => a.exam.full_price_cents - b.exam.full_price_cents);
}

type Busy = { start: number; end: number }; // epoch ms

async function busyIntervals(exam: Pick<ClinicExam, "clinic_id" | "room">, fromIso: string, toIso: string): Promise<Busy[]> {
  const [events, reservations, vacancies] = await Promise.all([
    db()
      .from("calendar_events")
      .select("starts_at, ends_at")
      .eq("clinic_id", exam.clinic_id)
      .eq("room", exam.room)
      .is("cancelled_at", null)
      .lt("starts_at", toIso)
      .gt("ends_at", fromIso),
    db()
      .from("reservations")
      .select("starts_at, clinic_exam:clinic_exams!inner(clinic_id, room)")
      .eq("status", "reservada")
      .eq("clinic_exam.clinic_id", exam.clinic_id)
      .eq("clinic_exam.room", exam.room)
      .gte("starts_at", new Date(Date.parse(fromIso) - 3600_000).toISOString())
      .lt("starts_at", toIso),
    db()
      .from("vacancies")
      .select("starts_at, duration_min, status, clinic_exam:clinic_exams!inner(clinic_id, room)")
      .in("status", ["publicada", "alertando"])
      .eq("clinic_exam.clinic_id", exam.clinic_id)
      .eq("clinic_exam.room", exam.room)
      .gte("starts_at", new Date(Date.parse(fromIso) - 3600_000).toISOString())
      .lt("starts_at", toIso),
  ]);
  const out: Busy[] = [];
  for (const e of must(events) as { starts_at: string; ends_at: string }[]) out.push({ start: Date.parse(e.starts_at), end: Date.parse(e.ends_at) });
  for (const r of must(reservations) as { starts_at: string }[]) out.push({ start: Date.parse(r.starts_at), end: Date.parse(r.starts_at) + 40 * 60_000 });
  for (const v of must(vacancies) as { starts_at: string; duration_min: number }[])
    out.push({ start: Date.parse(v.starts_at), end: Date.parse(v.starts_at) + v.duration_min * 60_000 });
  return out;
}

/** Horários livres (ISO) por dia, de `fromDay` por `days` dias. Só horários pelo menos 1 h à frente. */
export async function availability(
  exam: Pick<ClinicExam, "clinic_id" | "room"> & { duration_min?: number },
  fromDay: string,
  days: number,
  now?: Date,
): Promise<Record<string, string[]>> {
  const nowMs = (now ?? (await getDemoNow())).getTime();
  const toDay = addDays(fromDay, days);
  const busy = await busyIntervals(exam, spInstant(fromDay, "00:00"), spInstant(toDay, "00:00"));
  const result: Record<string, string[]> = {};
  for (let i = 0; i < days; i++) {
    const day = addDays(fromDay, i);
    const slots: string[] = [];
    // Horários na duração do exame: 40 min no unilateral, mais no bilateral.
    const slot = exam.duration_min && exam.duration_min > 0 ? exam.duration_min : SLOT_MIN;
    for (let m = DAY_START_MIN; m + slot <= DAY_END_MIN; m += slot) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const iso = spInstant(day, hhmm);
      const start = Date.parse(iso);
      const end = start + slot * 60_000;
      if (start < nowMs + 3600_000) continue;
      if (busy.some((b) => b.start < end && b.end > start)) continue;
      slots.push(iso);
    }
    result[day] = slots;
  }
  return result;
}

export async function listPatientReservations(patientId: string) {
  await connection();
  return must(
    await db()
      .from("reservations")
      .select(`*, clinic_exam:clinic_exams(${CLINIC_EXAM_SELECT})`)
      .eq("patient_id", patientId)
      .eq("status", "reservada")
      .order("starts_at"),
  ) as unknown as (Reservation & { clinic_exam: ClinicExam })[];
}

export async function getReservation(id: string) {
  await connection();
  return must(
    await db().from("reservations").select(`*, clinic_exam:clinic_exams(${CLINIC_EXAM_SELECT})`).eq("id", id).maybeSingle(),
  ) as unknown as (Reservation & { clinic_exam: ClinicExam }) | null;
}

export async function listWaitlist(patientId: string) {
  await connection();
  return must(
    await db().from("waitlist").select("*").eq("patient_id", patientId).eq("active", true).order("created_at", { ascending: false }),
  ) as {
    id: string;
    region_key: string;
    side: string | null;
    exam_label: string;
    radius_km: number;
    max_price_cents: number;
    weekdays: string[];
    can_go_today: boolean;
    expires_at: string;
  }[];
}

// ---------- Clínica ----------

export async function getClinic() {
  await connection();
  return must(await db().from("clinics").select("id, name, address, opening_hours, agency:agencies(name)").eq("id", CLINIC_ID).single()) as unknown as {
    id: string;
    name: string;
    address: string;
    opening_hours: string;
    agency: { name: string };
  };
}

export async function getGoogleConnection() {
  await connection();
  return must(
    await db().from("calendar_connections").select("*").eq("clinic_id", CLINIC_ID).eq("provider", "google").maybeSingle(),
  ) as { account_email: string | null; connected: boolean; connected_at: string | null } | null;
}

export type AgendaBlock = {
  id: string;
  room: string;
  starts_at: string;
  ends_at: string;
  kind: "patient" | "block" | "vacancy" | "booked";
  title: string;
  detail: string | null;
  source: "google" | "manual" | "vagacerta";
};

/** Tudo o que ocupa a agenda da clínica num dia: eventos, vagas abertas e reservas. */
export async function listAgenda(day: string, opts: { googleConnected: boolean }): Promise<AgendaBlock[]> {
  await connection();
  const from = spInstant(day, "00:00");
  const to = spInstant(addDays(day, 1), "00:00");
  const [events, vacancies, reservations] = await Promise.all([
    db().from("calendar_events").select("*").eq("clinic_id", CLINIC_ID).is("cancelled_at", null).gte("starts_at", from).lt("starts_at", to),
    db().from("vacancies_live").select("*").eq("clinic_id", CLINIC_ID).in("status", ["publicada", "alertando"]).gte("starts_at", from).lt("starts_at", to),
    db()
      .from("reservations")
      .select("id, starts_at, kind, price_cents, clinic_exam:clinic_exams!inner(clinic_id, room, display_name)")
      .eq("status", "reservada")
      .eq("clinic_exam.clinic_id", CLINIC_ID)
      .gte("starts_at", from)
      .lt("starts_at", to),
  ]);
  const blocks: AgendaBlock[] = [];
  for (const e of must(events) as CalendarEvent[]) {
    if (e.source === "google" && !opts.googleConnected) continue;
    blocks.push({ id: e.id, room: e.room, starts_at: e.starts_at, ends_at: e.ends_at, kind: e.kind, title: e.title, detail: e.detail, source: e.source });
  }
  for (const v of must(vacancies) as VacancyLive[]) {
    blocks.push({
      id: v.id,
      room: v.room,
      starts_at: v.starts_at,
      ends_at: new Date(Date.parse(v.starts_at) + v.duration_min * 60_000).toISOString(),
      kind: "vacancy",
      title: `Encaixe R$ ${Math.round(v.price_cents / 100)}`,
      detail: v.reason === "cancelamento" ? "Cancelamento · alertando" : v.reason === "noite" ? "Horário noturno" : "Horário vazio",
      source: "vagacerta",
    });
  }
  for (const r of must(reservations) as unknown as { id: string; starts_at: string; kind: string; clinic_exam: { room: string; display_name: string } }[]) {
    blocks.push({
      id: r.id,
      room: r.clinic_exam.room,
      starts_at: r.starts_at,
      ends_at: new Date(Date.parse(r.starts_at) + 40 * 60_000).toISOString(),
      kind: "booked",
      title: r.kind === "encaixe" ? "Encaixe reservado" : "Reserva pelo app",
      detail: `${r.clinic_exam.display_name} · sinal pago`,
      source: "vagacerta",
    });
  }
  return blocks.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Próximos agendamentos que a clínica pode cancelar e publicar como vaga. */
export async function listUpcomingAppointments(limit = 8) {
  await connection();
  const now = await getDemoNow();
  const google = await getGoogleConnection();
  let q = db()
    .from("calendar_events")
    .select("id, room, starts_at, ends_at, title, detail, source, clinic_exam:clinic_exams(id, display_name, full_price_cents, floor_price_cents)")
    .eq("clinic_id", CLINIC_ID)
    .eq("kind", "patient")
    .is("cancelled_at", null)
    .not("clinic_exam_id", "is", null)
    .gt("starts_at", now.toISOString())
    .order("starts_at")
    .limit(limit);
  if (!google?.connected) q = q.eq("source", "manual");
  return must(await q) as unknown as {
    id: string;
    room: string;
    starts_at: string;
    ends_at: string;
    title: string;
    detail: string | null;
    source: string;
    clinic_exam: { id: string; display_name: string; full_price_cents: number; floor_price_cents: number };
  }[];
}

export async function listClinicVacancies() {
  await connection();
  const now = await getDemoNow();
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  return must(
    await db().from("vacancies_live").select("*").eq("clinic_id", CLINIC_ID).gte("starts_at", since).order("published_at", { ascending: false }),
  ) as VacancyLive[];
}

export async function getDashboardStats() {
  await connection();
  const now = await getDemoNow();
  const today = spDay(now);
  const from = spInstant(today, "00:00");
  const [vac, res] = await Promise.all([
    db().from("vacancies").select("id, status, clinic_exam:clinic_exams!inner(clinic_id)").eq("clinic_exam.clinic_id", CLINIC_ID).gte("published_at", from),
    db()
      .from("reservations")
      .select("price_cents, vacancy_id, clinic_exam:clinic_exams!inner(clinic_id)")
      .eq("clinic_exam.clinic_id", CLINIC_ID)
      .eq("kind", "encaixe")
      .eq("status", "reservada")
      .gte("created_at", from),
  ]);
  const published = (must(vac) as unknown[]).length;
  const booked = must(res) as { price_cents: number }[];
  const revenue = booked.reduce((s, r) => s + r.price_cents, 0);
  return {
    published,
    reserved: booked.length,
    revenueCents: revenue,
    fillRate: published ? Math.round((booked.length / published) * 100) : 0,
  };
}

/** Ids dos exames que podem ocupar o horário cancelado de um exame. */
export async function listSubstituteIds(examId: string): Promise<string[]> {
  await connection();
  const rows = must(await db().from("clinic_exam_substitutes").select("substitute_id").eq("clinic_exam_id", examId)) as { substitute_id: string }[];
  return rows.map((r) => r.substitute_id);
}

export async function listClinicExams() {
  await connection();
  const exams = must(
    await db().from("clinic_exams").select(CLINIC_EXAM_SELECT).eq("clinic_id", CLINIC_ID).order("display_name"),
  ) as unknown as ClinicExam[];
  const now = await getDemoNow();
  const since = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const vac = must(
    await db().from("vacancies").select("clinic_exam_id, status").in("clinic_exam_id", exams.map((e) => e.id)).gte("published_at", since),
  ) as { clinic_exam_id: string; status: string }[];
  return exams.map((e) => ({
    ...e,
    vacancies30d: vac.filter((v) => v.clinic_exam_id === e.id).length,
    reserved30d: vac.filter((v) => v.clinic_exam_id === e.id && v.status === "reservada").length,
  }));
}

/** Minutos desde 00:00 em São Paulo (atalho para a grade da agenda). */
export { spMinutes };
