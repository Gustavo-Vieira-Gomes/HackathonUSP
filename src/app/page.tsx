import Link from "next/link";
import { IconArrowRight, Wordmark } from "@/components/icons";

// Entrada do protótipo: escolhe entre o app do paciente e o painel da clínica.
export default function Home() {
  return (
    <main className="vc" style={{ minHeight: "100dvh", padding: "48px max(16px, 4vw)", display: "flex", flexDirection: "column", gap: 32, maxWidth: 1080, margin: "0 auto" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Wordmark height={34} tone="onLight" />
        </div>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", maxWidth: "18ch", textWrap: "balance" }}>
          O horário que ia ficar vazio vira exame mais barato para quem estava esperando.
        </h1>
        <p className="muted" style={{ maxWidth: "60ch" }}>
          Protótipo navegável. Os dados são de exemplo e ficam no Supabase do projeto; o relógio da demo, no painel da clínica, adianta o tempo para ver o preço cair.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        <Link href="/paciente" className="card" style={{ padding: 24, textDecoration: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="chip st-publicada" style={{ alignSelf: "flex-start" }}>App do paciente</span>
          <strong style={{ fontSize: 22 }} className="disp">Buscar exame e reservar encaixe</strong>
          <span className="muted">Busca por tipo, região e lado; encaixe com desconto ou horário normal; aviso de vaga; sinal por Pix ou cartão.</span>
          <span className="btn btn-primary" style={{ alignSelf: "flex-start", marginTop: 6 }}>Abrir app <IconArrowRight /></span>
        </Link>
        <Link href="/clinica" className="card" style={{ padding: 24, textDecoration: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="chip st-reservada" style={{ alignSelf: "flex-start" }}>Painel da clínica</span>
          <strong style={{ fontSize: 22 }} className="disp">Agenda, cancelamentos e exames</strong>
          <span className="muted">Agenda do dia por sala, cancelamento que vira vaga, cadastro de exames e conexão simulada com a Google Agenda.</span>
          <span className="btn btn-ghost" style={{ alignSelf: "flex-start", marginTop: 6 }}>Abrir painel <IconArrowRight /></span>
        </Link>
      </div>

      <p className="small muted">
        Começar do zero: <Link href="/paciente/cadastro">cadastro do paciente</Link>.
      </p>
    </main>
  );
}
