"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { connectWhatsApp, disconnectWhatsApp, saveConfirmationSettings } from "@/lib/actions";
import { IconAlert, IconChat } from "@/components/icons";
import { useToast } from "./Toast";

const SEND = [12, 24, 48, 72];
const DEADLINE = [2, 6, 12, 24, 48];

export type WhatsAppState = "sem_config" | "fora_do_ar" | "sem_instancia" | "desconectado" | "conectando" | "conectado";

const STATE_TEXT: Record<WhatsAppState, { title: string; detail: string }> = {
  conectado: { title: "WhatsApp conectado", detail: "As confirmações saem pelo número pareado na Evolution API." },
  conectando: { title: "Aguardando o pareamento", detail: "Leia o QR code no WhatsApp do celular da clínica." },
  desconectado: { title: "WhatsApp desconectado", detail: "Gere o QR code e leia no WhatsApp da clínica. Até lá, as confirmações ficam no simulador." },
  sem_instancia: { title: "Número ainda não pareado", detail: "Gere o QR code e leia no WhatsApp da clínica. Até lá, as confirmações ficam no simulador." },
  fora_do_ar: { title: "Evolution API fora do ar", detail: "Suba o docker compose com npm run whatsapp:up. Até lá, as confirmações ficam no simulador." },
  sem_config: { title: "Evolution API não configurada", detail: "Preencha EVOLUTION_API_URL e EVOLUTION_API_KEY no .env.local. Até lá, as confirmações ficam no simulador." },
};

/** Perfil da clínica: quando a confirmação sai, até quando o paciente responde e o número do WhatsApp. */
export function WhatsAppSettings({ sendHours, deadlineHours, state }: { sendHours: number; deadlineHours: number; state: WhatsAppState }) {
  const router = useRouter();
  const toast = useToast();
  const [send, setSend] = useState(sendHours);
  const [deadline, setDeadline] = useState(deadlineHours);
  const [error, setError] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const invalid = send <= deadline;
  const changed = send !== sendHours || deadline !== deadlineHours;

  function save(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    setError("");
    startTransition(async () => {
      const res = await saveConfirmationSettings(send, deadline);
      if (!res.ok) setError(res.error);
      else toast.show("Prazos salvos. Valem para as próximas confirmações.");
    });
  }

  function connect() {
    setError("");
    startTransition(async () => {
      const res = await connectWhatsApp();
      if (!res.ok) setError(res.error);
      else if (res.data?.qr) setQr(res.data.qr);
      else {
        toast.show("O número já está pareado.");
        router.refresh();
      }
    });
  }

  function disconnect() {
    startTransition(async () => {
      const res = await disconnectWhatsApp();
      if (!res.ok) setError(res.error);
      else {
        setQr(null);
        toast.show("WhatsApp desconectado. As confirmações voltam para o simulador.");
        router.refresh();
      }
    });
  }

  const st = STATE_TEXT[state];
  const ok = state === "conectado";

  return (
    <section className="card" aria-labelledby="wa-h" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id="wa-h" style={{ fontSize: 22 }}>
          Confirmação pelo WhatsApp
        </h2>
        <p className="small muted">
          O paciente recebe uma mensagem e responde 1 para confirmar ou 2 para cancelar. Se cancelar ou não responder até o prazo, a reserva cai, o
          sinal é devolvido e o horário vira encaixe para a fila.
        </p>
      </div>

      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <div className="field">
            <label htmlFor="wa-send">Enviar a mensagem</label>
            <select id="wa-send" className="input" value={send} onChange={(e) => setSend(Number(e.target.value))}>
              {SEND.map((h) => (
                <option key={h} value={h}>
                  {h} h antes do exame
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="wa-deadline">Prazo para responder</label>
            <select
              id="wa-deadline"
              className={invalid ? "input err" : "input"}
              value={deadline}
              onChange={(e) => setDeadline(Number(e.target.value))}
              aria-invalid={invalid || undefined}
              aria-describedby="wa-deadline-help"
            >
              {DEADLINE.map((h) => (
                <option key={h} value={h}>
                  até {h} h antes do exame
                </option>
              ))}
            </select>
            <span id="wa-deadline-help" className={invalid ? "help err" : "help"}>
              {invalid ? "O prazo precisa terminar depois que a mensagem sai." : `O paciente tem ${send - deadline} h para responder.`}
            </span>
          </div>
        </div>
        <p className="small" style={{ color: "var(--ink-2)" }}>
          Reservas feitas depois do prazo, como os encaixes de última hora, não recebem a confirmação.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={pending || invalid || !changed}>
            Salvar prazos
          </button>
        </div>
      </form>

      <hr className="hr" />

      <div className={ok ? "wa-status ok" : "wa-status"}>
        {ok ? <IconChat style={{ color: "var(--teal-d)", flex: "none" }} /> : <IconAlert style={{ color: "var(--red)", flex: "none" }} />}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <strong>{st.title}</strong>
          <span className="small" style={{ color: "var(--ink-2)" }}>
            {st.detail}
          </span>
        </div>
        {ok ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={disconnect} disabled={pending}>
            Desconectar
          </button>
        ) : state !== "sem_config" && state !== "fora_do_ar" ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={connect} disabled={pending}>
            {pending ? "Gerando…" : qr ? "Gerar outro QR" : "Gerar QR code"}
          </button>
        ) : null}
      </div>

      {qr && !ok ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR em data URI vindo da Evolution */}
          <img src={qr} alt="QR code para parear o WhatsApp da clínica" width={220} height={220} style={{ borderRadius: 12, boxShadow: "inset 0 0 0 1px var(--line)" }} />
          <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, color: "var(--ink-2)", maxWidth: 320 }}>
            <li>No celular da clínica, abra o WhatsApp.</li>
            <li>Toque em Aparelhos conectados e depois em Conectar um aparelho.</li>
            <li>Aponte a câmera para o QR code. Depois, recarregue esta página.</li>
          </ol>
        </div>
      ) : null}

      {error ? (
        <span role="alert" className="help err">
          {error}
        </span>
      ) : null}
      {toast.node}
    </section>
  );
}
