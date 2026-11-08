import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runConfirmationTick } from "@/lib/whatsapp/flow";

// Ciclo da confirmação: envia as mensagens que venceram e cancela quem passou do prazo.
// O painel da clínica chama a cada minuto; um cron também pode chamar (POST).
export async function POST() {
  try {
    const result = await runConfirmationTick();
    if (result.sent || result.expired) revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (e) {
    console.error("[whatsapp] ciclo falhou:", e);
    return NextResponse.json({ error: "falha no ciclo" }, { status: 500 });
  }
}
