import Link from "next/link";
import { IconCalendarX } from "@/components/icons";
import { Screen } from "./Screen";

/** Vaga que não existe mais, já foi reservada ou expirou. */
export function VacancyGone({ status, examsHref }: { status: "reservada" | "expirada" | "missing"; examsHref: string }) {
  const title = status === "reservada" ? "Outra pessoa reservou esta vaga" : status === "expirada" ? "Esta vaga expirou" : "Vaga não encontrada";
  const text =
    status === "reservada"
      ? "Quem paga o sinal primeiro fica com a vaga. Veja os outros horários com desconto."
      : status === "expirada"
        ? "O horário já passou. Veja os outros horários com desconto."
        : "O link pode estar errado ou a vaga saiu do ar. Veja os horários disponíveis.";
  return (
    <Screen style={{ padding: "20px 20px 24px", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 36 }}>
        <span className={status === "reservada" ? "chip st-reservada" : "chip st-expirada"}>
          {status === "reservada" ? "Reservada" : status === "expirada" ? "Expirada" : "Indisponível"}
        </span>
      </div>
      <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <span style={{ width: 48, height: 48, borderRadius: 14, background: "var(--mint)", color: "var(--teal-d)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconCalendarX size={24} />
        </span>
        <h1 style={{ fontSize: 26 }}>{title}</h1>
        <p className="muted">{text}</p>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link className="btn btn-primary btn-block" href={examsHref}>
          Ver outros horários
        </Link>
        <Link className="btn btn-ghost btn-block" href="/paciente">
          Voltar ao início
        </Link>
      </div>
    </Screen>
  );
}
