"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./supabase";
import { CLINIC_ID } from "./data";
import {
  currentPatientId,
  setCurrentPatient,
  clearCurrentPatient,
  startPatientSession,
  endPatientSession,
  startClinicSession,
  endClinicSession,
} from "./session";
import { safeNext } from "./auth-cookies";
import { handleInbound, tickQuietly } from "./whatsapp/flow";
import { whatsappConnect, whatsappLogout } from "./whatsapp/evolution";

// Protótipo com login simulado: qualquer e-mail e senha entram. O paciente vem do cookie
// (cadastrado neste navegador ou a Marina da demo) e a clínica é a de demonstração.
// As regras (preço, trava da vaga, horário ocupado) ficam nas funções do banco.

// Pausa curta para o "Entrando…" aparecer e o login parecer um login.
const loginPause = () => new Promise((r) => setTimeout(r, 450));

// Pausa curta depois de reservar: dá tempo de a animação de pagamento aparecer na demo.
const paymentPause = () => new Promise((r) => setTimeout(r, 1800));

// ---------- Login simulado ----------

export async function loginPatient(formData: FormData) {
  await loginPause();
  await startPatientSession();
  redirect(safeNext(formData.get("next"), "/paciente"));
}

export async function logoutPatient() {
  await endPatientSession();
  redirect("/paciente/entrar");
}

export async function loginClinic(formData: FormData) {
  await loginPause();
  await startClinicSession();
  redirect(safeNext(formData.get("next"), "/clinica"));
}

export async function logoutClinic() {
  await endClinicSession();
  redirect("/clinica/entrar");
}

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "Algo deu errado. Tente de novo.";
  return { ok: false, error: message };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------- Paciente ----------

export async function registerPatient(input: { name: string; cpf: string; email: string; phone: string }): Promise<ActionResult> {
  try {
    const id = await rpc<string>("register_patient", { p_name: input.name, p_cpf: input.cpf, p_email: input.email, p_phone: input.phone });
    await setCurrentPatient(id);
    await startPatientSession();
  } catch (e) {
    return fail(e);
  }
  redirect("/paciente");
}

export async function switchToDemoPatient() {
  await clearCurrentPatient();
  await startPatientSession();
  redirect("/paciente");
}

export async function subscribeWaitlist(input: {
  regionKey: string;
  side: string | null;
  examLabel: string;
  radiusKm: number;
  maxPriceCents: number;
  weekdays: string[];
  canGoToday: boolean;
}): Promise<ActionResult> {
  try {
    await rpc("subscribe_waitlist", {
      p_patient: await currentPatientId(),
      p_region_key: input.regionKey,
      p_side: input.side,
      p_exam_label: input.examLabel,
      p_radius_km: input.radiusKm,
      p_max_price_cents: input.maxPriceCents,
      p_weekdays: input.weekdays,
      p_can_go_today: input.canGoToday,
    });
    revalidatePath("/paciente");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Reserva a vaga para o exame dela ou, com `offerExamId`, para um substituto que a clínica liberou. */
export async function reserveVacancy(
  vacancyId: string,
  payment: "pix" | "card",
  offerExamId?: string | null,
  side?: string | null,
): Promise<ActionResult> {
  let id: string;
  try {
    id = await rpc<string>("reserve_vacancy", {
      p_patient: await currentPatientId(),
      p_vacancy: vacancyId,
      p_payment: payment,
      p_offer_exam: offerExamId ?? null,
      p_side: side ?? null,
    });
  } catch (e) {
    return fail(e);
  }
  await Promise.all([paymentPause(), tickQuietly()]);
  revalidatePath("/", "layout");
  redirect(`/paciente/reservas/${id}`);
}

/** `side`: lado pedido (esquerdo/direito), «ambos» na oferta bilateral ou nada quando o paciente vai conferir o pedido. */
export async function reserveNormal(clinicExamId: string, startsAt: string, payment: "pix" | "card", side?: string | null): Promise<ActionResult> {
  let id: string;
  try {
    id = await rpc<string>("reserve_normal", { p_patient: await currentPatientId(), p_clinic_exam: clinicExamId, p_starts: startsAt, p_payment: payment, p_side: side ?? null });
  } catch (e) {
    return fail(e);
  }
  await Promise.all([paymentPause(), tickQuietly()]);
  revalidatePath("/", "layout");
  redirect(`/paciente/reservas/${id}`);
}

// ---------- Clínica ----------

export async function publishCancellation(eventId: string): Promise<ActionResult<string>> {
  try {
    const id = await rpc<string>("publish_cancellation", { p_event: eventId });
    revalidatePath("/", "layout");
    return { ok: true, data: id };
  } catch (e) {
    return fail(e);
  }
}

export async function createCalendarEvent(input: {
  room: string;
  startsAt: string;
  endsAt: string;
  kind: "patient" | "block";
  title: string;
  detail: string;
}): Promise<ActionResult> {
  try {
    await rpc("create_calendar_event", {
      p_clinic: CLINIC_ID,
      p_room: input.room,
      p_starts: input.startsAt,
      p_ends: input.endsAt,
      p_kind: input.kind,
      p_title: input.title,
      p_detail: input.detail,
    });
    revalidatePath("/clinica", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setGoogleConnection(connected: boolean, email?: string): Promise<ActionResult> {
  try {
    await rpc("set_google_connection", { p_clinic: CLINIC_ID, p_connected: connected, p_email: email ?? null });
    revalidatePath("/clinica", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Edição do perfil da clínica: nome, endereço e horário de funcionamento. */
export async function saveClinicInfo(input: { name: string; address: string; openingHours: string }): Promise<ActionResult> {
  try {
    await rpc("update_clinic_info", {
      p_clinic: CLINIC_ID,
      p_name: input.name,
      p_address: input.address,
      p_opening_hours: input.openingHours,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type ExamInput = {
  id: string | null;
  regionKey: string;
  side: string | null;
  displayName: string;
  tuss: string;
  room: string;
  fullCents: number;
  floorCents: number;
  minNoticeHours: number;
  prep: string;
  prepStarts: string;
  lateToleranceMin: number;
  warnings: string[];
  active: boolean;
  /** Exames da mesma sala que podem ocupar o horário quando este for cancelado. */
  substitutes: string[];
  /** Duração em minutos. */
  durationMin: number;
};

export async function saveClinicExam(input: ExamInput): Promise<ActionResult> {
  try {
    await rpc("upsert_clinic_exam", {
      p_id: input.id,
      p_clinic: CLINIC_ID,
      p_region_key: input.regionKey,
      p_side: input.side,
      p_display_name: input.displayName,
      p_tuss: input.tuss,
      p_room: input.room,
      p_full_cents: input.fullCents,
      p_floor_cents: input.floorCents,
      p_min_notice_hours: input.minNoticeHours,
      p_prep: input.prep,
      p_prep_starts: input.prepStarts,
      p_late_tolerance_min: input.lateToleranceMin,
      p_warnings: input.warnings,
      p_active: input.active,
      p_substitutes: input.substitutes,
      p_duration_min: input.durationMin,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect("/clinica/exames");
}

export async function deleteClinicExam(id: string): Promise<ActionResult> {
  try {
    await rpc("delete_clinic_exam", { p_id: id, p_clinic: CLINIC_ID });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect("/clinica/exames");
}

// ---------- Relógio da demo ----------

export async function advanceDemoClock(hours: number): Promise<ActionResult> {
  try {
    await rpc("demo_advance", { p_hours: hours });
    await tickQuietly();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resetDemo(): Promise<ActionResult> {
  try {
    await rpc("demo_reset", {});
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resetDemoClock(): Promise<ActionResult> {
  return advanceDemoClock(-100000);
}

// ---------- Confirmação pelo WhatsApp ----------

/** Resposta do paciente no simulador de WhatsApp do app: passa pelo mesmo fluxo do webhook. */
export async function sendSimulatedReply(text: string): Promise<ActionResult> {
  if (!text.trim()) return { ok: false, error: "Escreva uma mensagem." };
  try {
    await handleInbound({ patientId: await currentPatientId(), text: text.trim(), provider: "simulado" });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveConfirmationSettings(sendHours: number, deadlineHours: number): Promise<ActionResult> {
  try {
    await rpc("update_clinic_confirmation", { p_clinic: CLINIC_ID, p_send_hours: sendHours, p_deadline_hours: deadlineHours });
    await tickQuietly();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Gera o QR code para parear o número da clínica na Evolution API. */
export async function connectWhatsApp(): Promise<ActionResult<{ qr: string | null; pairingCode: string | null }>> {
  try {
    return { ok: true, data: await whatsappConnect() };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectWhatsApp(): Promise<ActionResult> {
  try {
    await whatsappLogout();
    revalidatePath("/clinica", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
