import "server-only";
import { db } from "@/lib/supabase";
import { brl, TZ } from "@/lib/format";
import { sendWhatsApp, type SendResult } from "./evolution";

// Confirmação de presença pelo WhatsApp. O ciclo (tick) roda quando o relógio da demo anda, depois de
// cada reserva e a cada minuto pelo painel da clínica: expira quem não respondeu e envia o que venceu.

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const when = (iso: string) => {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${dia}, às ${hora}`;
};
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

type Due = {
  reservation_id: string;
  patient_id: string;
  patient_name: string;
  phone: string | null;
  exam: string;
  clinic_name: string;
  clinic_address: string;
  starts_at: string;
  deadline: string;
  deposit_cents: number;
};
type Expired = Omit<Due, "clinic_address" | "deadline">;

export const TEXT = {
  ask: (d: Due) =>
    `Olá, ${firstName(d.patient_name)}! Aqui é o remark.\n\n` +
    `Seu exame *${d.exam}* na *${d.clinic_name}* é ${when(d.starts_at)}.\n` +
    `Endereço: ${d.clinic_address}.\n\n` +
    `Você vai?\n*1* · Confirmo\n*2* · Cancelar\n\n` +
    `Responda até ${when(d.deadline)}. Sem resposta, a reserva é cancelada, o horário vai para outro paciente e o sinal de ${brl(d.deposit_cents, { decimals: true })} é devolvido.`,
  confirmed: (exam: string, startsAt: string) =>
    `Presença confirmada. Seu exame *${exam}* é ${when(startsAt)}. Chegue 15 minutos antes com um documento com foto.`,
  cancelled: (exam: string, deposit: number) =>
    `Reserva de *${exam}* cancelada. O sinal de ${brl(deposit, { decimals: true })} volta para você pelo mesmo meio de pagamento em até 2 dias úteis. Para marcar de novo, é só abrir o remark.`,
  expired: (e: Expired) =>
    `${firstName(e.patient_name)}, não recebemos a sua confirmação a tempo, então a reserva de *${e.exam}* na ${e.clinic_name} (${when(e.starts_at)}) foi cancelada e o horário passou para a fila. O sinal de ${brl(e.deposit_cents, { decimals: true })} será devolvido.`,
  late: "O prazo para responder esta confirmação já passou. Se a reserva ainda aparece no app, ela segue de pé.",
  help: "Não entendi. Responda *1* para confirmar a sua ida ou *2* para cancelar.",
};

async function log(patientId: string, reservationId: string | null, direction: "out" | "in", body: string, sent: SendResult) {
  await rpc("log_whatsapp_message", {
    p_patient: patientId,
    p_reservation: reservationId,
    p_direction: direction,
    p_body: body,
    p_provider: sent.provider,
    p_provider_id: sent.id,
    p_error: sent.error,
  });
}

async function send(patientId: string, reservationId: string | null, phone: string | null, text: string) {
  const sent = await sendWhatsApp(phone, text);
  await log(patientId, reservationId, "out", text, sent);
}

/** Expira quem não respondeu e envia as confirmações que venceram. */
export async function runConfirmationTick(): Promise<{ sent: number; expired: number }> {
  const expired = (await rpc<Expired[]>("expire_confirmations")) ?? [];
  for (const e of expired) await send(e.patient_id, e.reservation_id, e.phone, TEXT.expired(e));
  const due = (await rpc<Due[]>("claim_confirmations")) ?? [];
  for (const d of due) await send(d.patient_id, d.reservation_id, d.phone, TEXT.ask(d));
  return { sent: due.length, expired: expired.length };
}

/** Roda o ciclo sem derrubar quem chamou (reserva, relógio): um erro aqui só vai para o log. */
export async function tickQuietly() {
  try {
    await runConfirmationTick();
  } catch (e) {
    console.error("[whatsapp] ciclo de confirmação falhou:", e);
  }
}

export function parseAnswer(text: string): "confirmar" | "cancelar" | null {
  const t = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .trim();
  if (/^(1|sim|s|confirmo|confirmar|confirmado|vou|ok)\b/.test(t)) return "confirmar";
  if (/^(2|nao|n|cancelar|cancela|cancelo|desmarcar)\b/.test(t)) return "cancelar";
  return null;
}

type Inbound =
  | { patientId: string; text: string; provider: "simulado" }
  | { phone: string; text: string; provider: "evolution"; providerId: string | null };

/** Resposta do paciente (webhook da Evolution ou simulador do app). */
export async function handleInbound(msg: Inbound): Promise<{ handled: boolean; outcome?: string }> {
  await tickQuietly(); // prazo vencido antes da resposta: a expiração vale primeiro
  const patientId = msg.provider === "simulado" ? msg.patientId : await rpc<string | null>("patient_by_phone", { p_digits: msg.phone });
  if (!patientId) return { handled: false };

  const patient = (
    await db().from("patients").select("phone").eq("id", patientId).maybeSingle()
  ).data as { phone: string | null } | null;
  const phone = msg.provider === "evolution" ? msg.phone : patient?.phone ?? null;

  const reservationId = await rpc<string | null>("pending_confirmation", { p_patient: patientId });
  await log(patientId, reservationId, "in", msg.text, {
    provider: msg.provider,
    id: msg.provider === "evolution" ? msg.providerId : null,
    error: null,
  });
  const answer = parseAnswer(msg.text);

  if (!reservationId) {
    // Sem confirmação pendente: só responde a quem tentou confirmar ou cancelar.
    if (answer) await send(patientId, null, phone, TEXT.late);
    return { handled: true, outcome: "sem_pendente" };
  }
  if (!answer) {
    await send(patientId, reservationId, phone, TEXT.help);
    return { handled: true, outcome: "nao_entendi" };
  }

  const outcome = await rpc<string>("answer_confirmation", { p_reservation: reservationId, p_answer: answer });
  const r = (
    await db().from("reservations").select("starts_at, deposit_cents, clinic_exam:clinic_exams(display_name)").eq("id", reservationId).single()
  ).data as unknown as { starts_at: string; deposit_cents: number; clinic_exam: { display_name: string } };
  const reply =
    outcome === "confirmada"
      ? TEXT.confirmed(r.clinic_exam.display_name, r.starts_at)
      : outcome === "cancelada"
        ? TEXT.cancelled(r.clinic_exam.display_name, r.deposit_cents)
        : TEXT.late;
  await send(patientId, reservationId, phone, reply);
  return { handled: true, outcome };
}
