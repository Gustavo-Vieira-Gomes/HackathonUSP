import { Suspense } from "react";
import Link from "next/link";
import { getDemoNow, listOffers, listOpenVacancies, type VacancyLive } from "@/lib/data";
import { examName, findRegion, sideSummary } from "@/lib/catalog";
import { brl, relDay, spInstant, spTime } from "@/lib/format";
import { TabBar } from "@/components/TabBar";
import { IconBell, IconCalendar, IconCalendarX, IconMoon, IconTarget } from "@/components/icons";
import { Screen, ScreenLoading } from "@/components/paciente/Screen";
import { Toast } from "@/components/paciente/Toast";
import { discountPct, param, readSearch, searchQuery, searchSide, vagaHref, type SearchParams } from "@/components/paciente/helpers";
import { ExamTabs } from "./ExamTabs";
import "./exames.css";

const MOTIVO: Record<VacancyLive["reason"], string> = {
  cancelamento: "Outro paciente cancelou em cima da hora",
  noite: "Horário noturno, menos procurado",
  vazio: "Horário vago na agenda",
};

export default function ExamesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <Exames searchParams={searchParams} />
    </Suspense>
  );
}

async function Exames({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const search = readSearch(sp);
  const [vacancies, offers, now] = await Promise.all([listOpenVacancies(search), listOffers(search), getDemoNow()]);
  const name = examName(search.regionKey, search.side);
  const avisoHref = `/paciente/aviso?${searchQuery(search)}`;
  const best = vacancies[0];
  // Lado que segue para a agenda: «conferir» numa oferta bilateral vira «ambos».
  const agendaQuery = (scope: string | null) => {
    const l = searchSide(scope, search.side);
    return l ? `?lado=${l}` : "";
  };
  const summary = sideSummary(search.regionKey, search.side);
  const checkExtent = !!findRegion(search.regionKey)?.region.checkExtent;

  const examBar = (
    <div className="panel" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 10px 10px 14px" }}>
      <span style={{ flex: "none", width: 40, height: 40, borderRadius: 12, background: "var(--mint)", color: "var(--teal-d)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <IconTarget />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="small muted" style={{ fontWeight: 600 }}>
          Seu exame
        </span>
        <h1 style={{ fontSize: 18, lineHeight: 1.2 }}>{name}</h1>
        {summary ? (
          <span className="small" style={{ fontWeight: 600, color: "var(--teal-d)" }}>
            {summary}
          </span>
        ) : null}
      </div>
      <Link className="btn btn-ghost btn-sm" href="/paciente" style={{ flex: "none" }}>
        Trocar
      </Link>
    </div>
  );

  const encaixe = (
    <>
      {best && (
        <div style={{ background: "var(--ink)", color: "#fff", borderRadius: 22, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>
            <span className="small" style={{ display: "block", color: "#c9e6e0" }}>
              Menor preço agora
            </span>
            <span style={{ display: "block", fontWeight: 600 }}>
              {relDay(best.starts_at, now)}, {spTime(best.starts_at)}
            </span>
          </span>
          <span className="num" style={{ fontSize: 34, color: "var(--amber)" }}>
            {brl(best.price_cents)}
          </span>
        </div>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-label="Encaixes">
        <p className="small muted">Vagas de última hora com desconto. Do mais barato para o mais caro.</p>
        {checkExtent ? <p className="small" style={{ color: "var(--ink-2)", marginTop: -4 }}>A clínica confere a extensão exata com o seu pedido antes da reserva definitiva.</p> : null}

        {vacancies.length > 0 ? (
          <>
            {vacancies.map((o) => {
              const dia = relDay(o.starts_at, now);
              const hora = spTime(o.starts_at);
              const off = discountPct(o.price_cents, o.full_price_cents);
              return (
                <article key={o.id} className="enc">
                  <span className="motivo" style={{ display: "flex", justifyContent: "space-between", alignSelf: "stretch", gap: 8 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {o.reason === "cancelamento" ? <IconCalendarX /> : o.reason === "noite" ? <IconMoon /> : <IconCalendar />}
                      {MOTIVO[o.reason]}
                    </span>
                    {search.side === "conferir" && o.side ? <span className="pill light">{o.side === "bilateral" ? "Bilateral" : "Um lado"}</span> : null}
                  </span>
                  <div className="enc-row">
                    <div className="enc-when">
                      <span className="small" style={{ fontWeight: 700 }}>
                        {dia}
                      </span>
                      <span className="num" style={{ fontSize: 22, lineHeight: 1 }}>
                        {hora}
                      </span>
                    </div>
                    <div className="enc-price">
                      {off > 0 && (
                        <>
                          <span className="strike">{brl(o.full_price_cents)}</span>
                          <span className="pill dark">−{off}%</span>
                        </>
                      )}
                      <span className="num" style={{ fontSize: 24, lineHeight: 1 }}>
                        {brl(o.price_cents)}
                      </span>
                    </div>
                  </div>
                  <div className="enc-row">
                    <div className="enc-who">
                      <strong style={{ fontSize: 15 }}>{o.clinic_name}</strong>
                      <span className="small" style={{ color: "var(--ink-2)" }}>
                        {o.agency_name}
                      </span>
                    </div>
                    <Link
                      className="btn btn-primary btn-sm"
                      href={vagaHref(o, "/avisos", search.side)}
                      aria-label={`Confirmar encaixe ${dia} às ${hora} na ${o.clinic_name} por ${brl(o.price_cents)}`}
                      style={{ flex: "none" }}
                    >
                      Confirmar
                    </Link>
                  </div>
                </article>
              );
            })}
            <Link
              href={avisoHref}
              className="small"
              style={{ alignSelf: "flex-start", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--teal-d)" }}
            >
              <IconBell />
              Nenhum serve? Avisar quando surgir outra vaga
            </Link>
          </>
        ) : (
          <article className="wait">
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ flex: "none", width: 44, height: 44, borderRadius: 14, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--teal-d)" }}>
                <IconBell />
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <strong style={{ fontSize: 17 }}>Nenhum encaixe agora</strong>
                <p className="small" style={{ color: "var(--ink-2)" }}>
                  Entre na fila e avisamos por mensagem quando abrir um horário com desconto perto de você. Quem pagar o sinal primeiro fica com a vaga.
                </p>
              </div>
            </div>
            <Link className="btn btn-primary btn-block" href={avisoHref}>
              Avisar quando surgir vaga
            </Link>
          </article>
        )}
      </section>
    </>
  );

  const normal = (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-label="Horário normal">
      <p className="small muted">Preço cheio de cada clínica. Escolha uma para ver os dias e horários livres.</p>
      {offers.length === 0 && (
        <article className="enc nor">
          <strong style={{ fontSize: 15 }}>Nenhuma clínica oferece este exame ainda</strong>
          <span className="small" style={{ color: "var(--ink-2)" }}>
            Crie um aviso de vaga e mandamos mensagem quando aparecer.
          </span>
        </article>
      )}
      {offers.map(({ exam, nextFreeDay }) => {
        const price = brl(exam.full_price_cents);
        return (
          <article key={exam.id} className="enc nor">
            <div className="enc-row">
              <div className="enc-when">
                <span className="small muted" style={{ fontWeight: 600 }}>
                  Próxima data
                </span>
                <span style={{ fontWeight: 700 }}>{nextFreeDay ? relDay(spInstant(nextFreeDay, "12:00"), now) : "Sem horário em 3 semanas"}</span>
              </div>
              {search.side === "conferir" && exam.side ? <span className="pill light">{exam.side === "bilateral" ? "Bilateral" : "Um lado"}</span> : null}
              <span className="num" style={{ fontSize: 24, lineHeight: 1 }}>
                {price}
              </span>
            </div>
            <div className="enc-row">
              <div className="enc-who">
                <strong style={{ fontSize: 15 }}>{exam.clinic.name}</strong>
                <span className="small" style={{ color: "var(--ink-2)" }}>
                  {exam.clinic.agency.name}
                </span>
              </div>
              <Link className="btn btn-ghost btn-sm" href={`/paciente/agenda/${exam.id}${agendaQuery(exam.side)}`} aria-label={`Ver agenda da ${exam.clinic.name}, ${price}`} style={{ flex: "none" }}>
                <IconCalendar />
                Ver agenda
              </Link>
            </div>
          </article>
        );
      })}
    </section>
  );

  return (
    <Screen className="scr-exames" style={{ padding: "22px 20px 20px", gap: 18 }} footer={<TabBar />}>
      <ExamTabs examBar={examBar} initial={param(sp, "aba") === "normal" ? "normal" : "encaixe"} nEnc={vacancies.length} nNor={offers.length} encaixe={encaixe} normal={normal} />
      {param(sp, "aviso") === "ok" && <Toast message="Aviso criado. Avisamos quando surgir vaga." />}
    </Screen>
  );
}

