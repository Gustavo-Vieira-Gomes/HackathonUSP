"use client";

import { useState } from "react";
import Link from "next/link";
import { addDays, brl, longDay, monthTitle, spTime, weekdayIndex } from "@/lib/format";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { BackLink } from "@/components/paciente/Screen";

// Grade do horário normal da clínica (07:00 às 19:00, na duração do exame). Hora fora da lista livre aparece ocupada.
function gridFor(slotMin: number): string[] {
  const out: string[] = [];
  for (let m = 7 * 60; m + slotMin <= 19 * 60; m += slotMin) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
}

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`;
}

function monthDays(first: string): string[] {
  const out: string[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) out.push(d);
  return out;
}

export function AgendaPicker({
  examId,
  title,
  priceCents,
  today,
  free,
  backHref,
  lado,
  slotMin = 40,
}: {
  examId: string;
  title: string;
  priceCents: number;
  today: string;
  free: Record<string, string[]>;
  backHref: string;
  lado: string | null;
  /** Duração do exame: define a grade de horários. */
  slotMin?: number;
}) {
  const days = Object.keys(free).sort();
  const isFree = (d: string) => (free[d]?.length ?? 0) > 0;
  const firstFree = days.find(isFree) ?? null;

  const firstMonth = monthStart(today);
  const lastMonth = monthStart(days[days.length - 1] ?? today);
  const [month, setMonth] = useState(firstFree ? monthStart(firstFree) : firstMonth);
  const [day, setDay] = useState<string | null>(firstFree);
  const [slot, setSlot] = useState<string | null>(firstFree ? free[firstFree][0] : null);

  const cells = monthDays(month);
  const blanks = weekdayIndex(month);
  const nextMonth = addDays(cells[cells.length - 1], 1);
  const prevMonth = monthStart(addDays(month, -1));

  const freeTimes = new Map((day ? free[day] ?? [] : []).map((iso) => [spTime(iso), iso]));
  const time = slot ? spTime(slot) : null;
  const href = slot ? `/paciente/confirmar/avisos?${new URLSearchParams({ exame: examId, horario: slot, ...(lado ? { lado } : {}) })}` : null;

  function pickDay(d: string) {
    setDay(d);
    setSlot(free[d]?.[0] ?? null);
  }

  return (
    <div className="vc scr-agenda" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", padding: "20px 20px 0", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BackLink href={backHref} label="Voltar aos preços" />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24 }}>Agenda da clínica</h1>
            <p className="small muted" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {title.split(" · ").length > 2 ? (
                <>
                  <span>{title.split(" · ").slice(0, 2).join(" · ")}</span>
                  <span style={{ color: "var(--teal-d)", fontWeight: 600 }}>{title.split(" · ").slice(2).join(" · ")}</span>
                </>
              ) : (
                title
              )}
            </p>
          </div>
        </div>

        <section aria-label="Escolha o dia" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <h2 style={{ fontSize: 18, marginRight: 4 }} aria-live="polite">
                {monthTitle(month)}
              </h2>
              <button type="button" className="mnav" aria-label="Mês anterior" disabled={month <= firstMonth} onClick={() => setMonth(prevMonth)}>
                <IconChevronLeft />
              </button>
              <button type="button" className="mnav" aria-label="Próximo mês" disabled={month >= lastMonth} onClick={() => setMonth(nextMonth)}>
                <IconChevronRight />
              </button>
            </div>
            <span className="small muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="dot" />
              Tem horário livre
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 4, textAlign: "center" }} className="small muted" aria-hidden="true">
            {WEEK.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 4 }}>
            {Array.from({ length: blanks }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {cells.map((d) => {
              const ok = isFree(d);
              const sel = d === day;
              return (
                <button
                  key={d}
                  type="button"
                  className={"day" + (ok ? "" : " off") + (d === today ? " today" : "") + (sel ? " sel" : "")}
                  disabled={!ok}
                  aria-label={`${longDay(d)}${ok ? ", com horário livre" : ", sem horário"}`}
                  aria-pressed={sel}
                  onClick={() => pickDay(d)}
                >
                  <span>{Number(d.slice(8))}</span>
                  <span className="dot" />
                </button>
              );
            })}
          </div>
          <p className="small muted">Dias sem ponto estão lotados, fechados ou já passaram.</p>
        </section>

        <section aria-label="Escolha a hora" style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14 }}>
          <h2 style={{ fontSize: 18 }}>{day ? longDay(day) : "Nenhum horário livre nas próximas semanas"}</h2>
          {day && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
              {gridFor(slotMin).map((t) => {
                const iso = freeTimes.get(t);
                const taken = !iso;
                const on = !taken && t === time;
                return (
                  <button
                    key={t}
                    type="button"
                    className={"slot" + (taken ? " taken" : "") + (on ? " sel" : "")}
                    disabled={taken}
                    aria-pressed={on}
                    aria-label={taken ? `${t}, ocupado` : t}
                    onClick={() => iso && setSlot(iso)}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <div style={{ padding: "0 20px 24px" }}>
        <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div>
              <div className="small muted">Você escolheu</div>
              <strong>{day && time ? `${longDay(day)} · ${time}` : "Escolha um dia e um horário"}</strong>
            </div>
            <span className="num" style={{ fontSize: 28 }}>
              {brl(priceCents)}
            </span>
          </div>
          {href ? (
            <Link className="btn btn-primary btn-block" href={href}>
              Continuar
            </Link>
          ) : (
            <button type="button" className="btn btn-block" disabled>
              Continuar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
