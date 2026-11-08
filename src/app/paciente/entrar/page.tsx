import Link from "next/link";
import { loginPatient } from "@/lib/actions";
import { safeNext } from "@/lib/auth-cookies";
import { Wordmark } from "@/components/icons";
import { LoginSubmit } from "@/components/LoginSubmit";
import { ComingSoonLink } from "@/components/ComingSoonLink";
import "../../login.css";

// Login simulado do paciente: os campos vêm preenchidos e qualquer e-mail e senha entram.
export default async function EntrarPaciente({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="vc" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <section className="pl-hero">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Wordmark height={28} tone="onDark" />
          </div>
          <h1 className="pl-title">Exame mais barato no horário que sobrou.</h1>
          <div className="stairs pl-stairs" aria-hidden="true">
            <div className="bar past" style={{ height: "100%" }}><span>0%</span></div>
            <div className="bar past" style={{ height: "82%" }}><span>−10%</span></div>
            <div className="bar past" style={{ height: "64%" }}><span>−20%</span></div>
            <div className="bar on" style={{ height: "46%" }}><span>−30%</span></div>
          </div>
        </section>

        <form action={loginPatient} className="card pl-card" aria-labelledby="pl-h">
          <input type="hidden" name="next" value={safeNext(next, "/paciente")} />
          <h2 id="pl-h" style={{ fontSize: 24 }}>Entrar</h2>
          <div className="field">
            <label htmlFor="pl-email">E-mail ou CPF</label>
            <input id="pl-email" name="email" className="input" autoComplete="username" defaultValue="marina@exemplo.com" />
          </div>
          <div className="field">
            <label htmlFor="pl-senha">Senha</label>
            <input id="pl-senha" name="senha" type="password" className="input" autoComplete="current-password" defaultValue="vagacerta" />
          </div>
          <ComingSoonLink className="link-btn" style={{ alignSelf: "flex-start" }}>Esqueci a senha</ComingSoonLink>
          <LoginSubmit />
          <p className="small muted" style={{ textAlign: "center" }}>
            Ainda não tem conta?{" "}
            <Link href="/paciente/cadastro" style={{ color: "var(--teal-d)", fontWeight: 700 }}>
              Criar conta
            </Link>
          </p>
        </form>

        <p className="small muted" style={{ textAlign: "center", padding: "4px 24px 24px" }}>
          Protótipo: o login é simulado e qualquer e-mail e senha entram.
        </p>
      </main>
    </div>
  );
}
