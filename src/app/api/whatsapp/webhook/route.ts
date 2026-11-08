import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { handleInbound } from "@/lib/whatsapp/flow";

// Webhook global da Evolution API (evento messages.upsert). A URL leva ?token= igual ao
// EVOLUTION_WEBHOOK_TOKEN do .env.local; sem ele, qualquer um poderia responder por um paciente.

type Upsert = {
  event?: string;
  data?: {
    key?: { remoteJid?: string; remoteJidAlt?: string; senderPn?: string; fromMe?: boolean; id?: string };
    message?: { conversation?: string; extendedTextMessage?: { text?: string } } | null;
  };
};

function senderNumber(key: NonNullable<NonNullable<Upsert["data"]>["key"]>): string | null {
  // Contas novas chegam com JID @lid; o número vem em remoteJidAlt ou senderPn.
  for (const jid of [key.remoteJidAlt, key.senderPn, key.remoteJid]) {
    if (jid && jid.endsWith("@s.whatsapp.net")) return jid.split("@")[0];
  }
  return null;
}

export async function POST(req: NextRequest) {
  const expected = process.env.EVOLUTION_WEBHOOK_TOKEN;
  if (!expected || req.nextUrl.searchParams.get("token") !== expected) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Upsert | null;
  const event = (body?.event ?? "").toLowerCase().replace("_", ".");
  if (event !== "messages.upsert" || !body?.data?.key) return NextResponse.json({ ignored: true });

  const { key, message } = body.data;
  if (key.fromMe || key.remoteJid?.endsWith("@g.us")) return NextResponse.json({ ignored: true });
  const text = message?.conversation ?? message?.extendedTextMessage?.text ?? "";
  const phone = senderNumber(key);
  if (!text.trim() || !phone) return NextResponse.json({ ignored: true });

  try {
    const result = await handleInbound({ phone, text, provider: "evolution", providerId: key.id ?? null });
    if (result.handled) revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (e) {
    console.error("[whatsapp] webhook falhou:", e);
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }
}
