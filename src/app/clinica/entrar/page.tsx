import { loginClinic } from "@/lib/actions";
import { safeNext } from "@/lib/auth-cookies";
import { IconCheck, Wordmark } from "@/components/icons";
import { LoginSubmit } from "@/components/LoginSubmit";
import { ComingSoonLink } from "@/components/ComingSoonLink";
import "../../login.css";

// Login simulado da clínica: os campos vêm preenchidos e qualquer e-mail e senha entram.
export default async function EntrarClinica({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="vc cl-wrap">
      <section className="cl-brand" aria-label="remark para clínicas">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Wordmark height={28} tone="onDark" />
          <span className="small" style={{ color: "#c9e6e0", marginLeft: 4 }}>para clínicas</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <h1>O horário cancelado vira receita.</h1>
          <ul className="cl-points">
            <li><IconCheck />Sua agenda junta os cadastros feitos aqui e os da Google Agenda.</li>
            <li><IconCheck />Cancelou em cima da hora? Publique a vaga e a fila é avisada na hora.</li>
            <li><IconCheck />O preço desce em degraus até o piso que você definir.</li>
          </ul>
        </div>

        <div className="cl-agenda" aria-hidden="true">
          <span className="small" style={{ color: "#c9e6e0" }}>Ressonância · hoje</span>
          <div className="cl-slot"><b>15:20</b>Pedro H. · Ombro direito</div>
          <div className="cl-slot off"><b>17:00</b>Renata C. · Joelho direito</div>
          <div className="cl-slot vaga"><b>17:00</b>Encaixe publicado · R$ 384</div>
        </div>
      </section>

      <div className="cl-form-side">
        <form action={loginClinic} className="card cl-card" aria-labelledby="cl-h">
          <input type="hidden" name="next" value={safeNext(next, "/clinica")} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 id="cl-h" style={{ fontSize: 28 }}>Entrar no painel</h2>
            <p className="muted">Acesso da equipe da clínica.</p>
          </div>
          <div className="field">
            <label htmlFor="cl-email">E-mail</label>
            <input id="cl-email" name="email" type="email" className="input" autoComplete="username" defaultValue="agenda@imagemvilanova.com.br" />
          </div>
          <div className="field">
            <label htmlFor="cl-senha">Senha</label>
            <input id="cl-senha" name="senha" type="password" className="input" autoComplete="current-password" defaultValue="vagacerta" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <label className="cl-check">
              <input type="checkbox" name="lembrar" defaultChecked />
              Manter conectado neste computador
            </label>
            <ComingSoonLink>Esqueci a senha</ComingSoonLink>
          </div>
          <LoginSubmit label="Entrar" className="btn btn-primary btn-block" />
          <p className="small muted" style={{ textAlign: "center" }}>
            A clínica ainda não é parceira? <ComingSoonLink style={{ minHeight: 0, fontSize: 13 }}>Fale com a gente</ComingSoonLink>
          </p>
          <hr className="hr" />
          <p className="small muted">Protótipo: o login é simulado e qualquer e-mail e senha entram.</p>
        </form>
      </div>
    </div>
  );
}
