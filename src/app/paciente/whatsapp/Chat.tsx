"use client";

import { Fragment, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { sendSimulatedReply } from "@/lib/actions";
import type { WhatsAppMessage } from "@/lib/data";
import { TZ } from "@/lib/format";

const hhmm = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayLabel = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(iso));

/** *negrito* do WhatsApp e quebras de linha. */
function rich(text: string): ReactNode {
  return text.split("\n").map((line, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      {line.split(/(\*[^*\n]+\*)/g).map((part, j) => (part.startsWith("*") && part.endsWith("*") && part.length > 2 ? <strong key={j}>{part.slice(1, -1)}</strong> : part))}
    </Fragment>
  ));
}

export function Chat({ messages, canAnswer, note }: { messages: WhatsAppMessage[]; canAnswer: boolean; note: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, optimistic]);

  function reply(value: string) {
    const v = value.trim();
    if (!v || pending) return;
    setError(null);
    setOptimistic(v);
    setText("");
    startTransition(async () => {
      const res = await sendSimulatedReply(v);
      if (!res.ok) setError(res.error);
      router.refresh();
      setOptimistic(null);
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    reply(text);
  }

  return (
    <div className="wa">
      <div className="wa-scroll" aria-live="polite">
        <p className="wa-note">{note}</p>
        {messages.length === 0 ? (
          <p className="wa-empty">
            Nenhuma mensagem ainda. A confirmação chega aqui antes do exame, no prazo que a clínica definiu.
          </p>
        ) : null}
        {messages.map((m, i) => {
          const day = dayLabel(m.created_at);
          const showDay = i === 0 || day !== dayLabel(messages[i - 1].created_at);
          return (
            <Fragment key={m.id}>
              {showDay ? <span className="wa-day">{day}</span> : null}
              <div className={m.direction === "out" ? "wa-msg out" : "wa-msg in"}>
                <span className="sr-only">{m.direction === "out" ? "remark disse:" : "Você respondeu:"}</span>
                <span>{rich(m.body)}</span>
                <span className="wa-time">
                  {hhmm(m.created_at)}
                  {m.error ? " · não enviada" : m.provider === "evolution" ? " · WhatsApp" : ""}
                </span>
              </div>
            </Fragment>
          );
        })}
        {optimistic ? (
          <div className="wa-msg in sending">
            <span>{optimistic}</span>
            <span className="wa-time">enviando…</span>
          </div>
        ) : null}
        <div ref={end} />
      </div>

      <div className="wa-bottom">
        {canAnswer && !pending ? (
          <div className="wa-quick" role="group" aria-label="Respostas rápidas">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => reply("1")}>
              1 · Confirmo
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => reply("2")}>
              2 · Cancelar
            </button>
          </div>
        ) : null}
        {error ? (
          <span role="alert" className="help err">
            {error}
          </span>
        ) : null}
        <form className="wa-form" onSubmit={submit}>
          <label htmlFor="wa-text" className="sr-only">
            Mensagem
          </label>
          <input id="wa-text" className="input" placeholder="Mensagem" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          <button type="submit" className="btn btn-primary" disabled={pending || !text.trim()} aria-label="Enviar">
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 12l16-8-6 16-2.5-6.5z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
