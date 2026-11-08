import "server-only";

// Cliente mínimo da Evolution API v2 (docker compose do repo). Sem EVOLUTION_API_URL ou sem número
// pareado, o envio cai no modo simulado: a mensagem fica só no histórico e aparece no simulador do app.

type Config = { url: string; key: string; instance: string };

function config(): Config | null {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || "remark";
  return url && key ? { url, key, instance } : null;
}

async function call<T>(cfg: Config, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: cfg.key, ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export type WhatsAppStatus =
  | { state: "sem_config" }
  | { state: "fora_do_ar"; error: string }
  | { state: "sem_instancia" }
  | { state: "desconectado" | "conectando" | "conectado"; instance: string };

let cached: { at: number; status: WhatsAppStatus } | null = null;

/** Estado da instância na Evolution. Guarda por 15 s para não consultar a cada mensagem. */
export async function whatsappStatus(fresh = false): Promise<WhatsAppStatus> {
  if (!fresh && cached && Date.now() - cached.at < 15_000) return cached.status;
  const cfg = config();
  let status: WhatsAppStatus;
  if (!cfg) status = { state: "sem_config" };
  else {
    try {
      const data = await call<{ instance?: { state?: string } }>(cfg, `/instance/connectionState/${encodeURIComponent(cfg.instance)}`);
      const s = data?.instance?.state;
      status = { state: s === "open" ? "conectado" : s === "connecting" ? "conectando" : "desconectado", instance: cfg.instance };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      status = /Evolution 404/.test(msg) ? { state: "sem_instancia" } : { state: "fora_do_ar", error: msg };
    }
  }
  cached = { at: Date.now(), status };
  return status;
}

/** Cria a instância (se faltar) e devolve o QR code para parear o número da clínica. */
export async function whatsappConnect(): Promise<{ qr: string | null; pairingCode: string | null }> {
  const cfg = config();
  if (!cfg) throw new Error("Defina EVOLUTION_API_URL e EVOLUTION_API_KEY no .env.local.");
  const status = await whatsappStatus(true);
  if (status.state === "fora_do_ar") throw new Error("A Evolution API não respondeu. Suba o docker compose (npm run whatsapp:up).");
  if (status.state === "sem_instancia") {
    await call(cfg, "/instance/create", {
      method: "POST",
      body: JSON.stringify({ instanceName: cfg.instance, integration: "WHATSAPP-BAILEYS", qrcode: true }),
    });
  }
  const data = await call<{ base64?: string; code?: string; pairingCode?: string }>(cfg, `/instance/connect/${encodeURIComponent(cfg.instance)}`);
  cached = null;
  return { qr: data?.base64 ?? null, pairingCode: data?.pairingCode ?? null };
}

export async function whatsappLogout(): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  await call(cfg, `/instance/logout/${encodeURIComponent(cfg.instance)}`, { method: "DELETE" });
  cached = null;
}

/** Número no formato do WhatsApp: só dígitos, com o 55 do Brasil. */
export function toWhatsAppNumber(phone: string | null): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

export type SendResult = { provider: "evolution" | "simulado"; id: string | null; error: string | null };

/** Envia pela Evolution quando há número pareado; senão registra como simulado. */
export async function sendWhatsApp(phone: string | null, text: string): Promise<SendResult> {
  const number = toWhatsAppNumber(phone);
  const cfg = config();
  if (!cfg || !number) return { provider: "simulado", id: null, error: null };
  const status = await whatsappStatus();
  if (status.state !== "conectado") return { provider: "simulado", id: null, error: null };
  try {
    const data = await call<{ key?: { id?: string } }>(cfg, `/message/sendText/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
      body: JSON.stringify({ number, text }),
    });
    return { provider: "evolution", id: data?.key?.id ?? null, error: null };
  } catch (e) {
    return { provider: "evolution", id: null, error: e instanceof Error ? e.message : String(e) };
  }
}
