"use client";

import { Wordmark } from "@/components/icons";

import { useState, useTransition } from "react";
import Link from "next/link";
import { registerPatient, switchToDemoPatient } from "@/lib/actions";

function cpfOk(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += Number(d[i]) * (t + 1 - i);
    const dv = ((sum * 10) % 11) % 10;
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

function maskCpf(d: string): string {
  let o = d.slice(0, 3);
  if (d.length > 3) o += "." + d.slice(3, 6);
  if (d.length > 6) o += "." + d.slice(6, 9);
  if (d.length > 9) o += "-" + d.slice(9, 11);
  return o;
}

function maskTel(d: string): string {
  if (!d) return "";
  const cut = d.length > 10 ? 7 : 6;
  let o = "(" + d.slice(0, 2);
  if (d.length > 2) o += ") " + d.slice(2, cut);
  if (d.length > cut) o += "-" + d.slice(cut, 11);
  return o;
}

const Check = () => (
  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export function SignupForm() {
  const [step, setStep] = useState(1);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [senha, setSenha] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const full = cpf.length === 11;
  const ok = cpfOk(cpf);
  const bad = full && !ok;
  const nomeOk = nome.trim().split(/\s+/).length >= 2 && nome.trim().length >= 5;
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const telOk = tel.length >= 10;
  const pwOk = senha.length >= 8;
  const valid = step === 1 ? nomeOk && ok : step === 2 ? emailOk && telOk && pwOk : false;

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await registerPatient({ name: nome.trim(), cpf, email: email.trim(), phone: maskTel(tel) });
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="vc scr-cadastro" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", padding: "24px 20px 24px", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Wordmark height={26} tone="onLight" />
          </div>
          <span className="small muted" style={{ fontWeight: 600 }}>
            Passo {step} de 3
          </span>
        </div>
        <div
          style={{ height: 6, borderRadius: 3, background: "#e4f1ee" }}
          role="progressbar"
          aria-label="Progresso do cadastro"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={step}
        >
          <div style={{ width: `${Math.round((step / 3) * 100)}%`, height: "100%", borderRadius: 3, background: "var(--teal)", transition: "width .3s" }} />
        </div>

        {step === 1 && (
          <div className="step">
            <div>
              <h1 style={{ fontSize: 32 }}>Vamos começar</h1>
              <p className="muted" style={{ marginTop: 6 }}>
                Dois dados para a clínica saber quem você é.
              </p>
            </div>
            <div className="field">
              <label htmlFor="n">Nome completo</label>
              <input id="n" className="input big" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como está no seu documento" />
            </div>
            <div className="field">
              <label htmlFor="c">CPF</label>
              <input
                id="c"
                className={"input big" + (bad ? " err" : ok ? " ok" : "")}
                inputMode="numeric"
                autoComplete="off"
                maxLength={14}
                value={maskCpf(cpf)}
                onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="000.000.000-00"
                aria-describedby="cpfm"
                aria-invalid={bad}
              />
              <div id="cpfm" className={bad ? "msg err" : ok ? "msg ok" : "msg help"} aria-live="polite">
                {bad ? "Esse CPF não parece certo. Confira os números." : ok ? "CPF válido" : "Só números. Nós colocamos os pontos."}
              </div>
            </div>
            <div className="why">
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <span>Usamos o CPF só para identificar você na clínica no dia do exame. Outras pessoas não veem.</span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="step">
            <div>
              <h1 style={{ fontSize: 32 }}>Como falamos com você?</h1>
              <p className="muted" style={{ marginTop: 6 }}>
                Avisamos das vagas por aqui.
              </p>
            </div>
            <div className="field">
              <label htmlFor="e">E-mail</label>
              <input id="e" className="input big" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
            </div>
            <div className="field">
              <label htmlFor="t">Celular com DDD</label>
              <input
                id="t"
                className="input big"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={maskTel(tel)}
                onChange={(e) => setTel(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="(11) 90000-0000"
                aria-describedby="th"
              />
              <span id="th" className="help">
                Mandamos um código por mensagem para confirmar.
              </span>
            </div>
            <div className="field">
              <label htmlFor="s">Crie uma senha</label>
              <div className="pw">
                <input
                  id="s"
                  className="input big"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  aria-describedby="sh"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} aria-pressed={showPw}>
                  {showPw ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <span id="sh" className={senha.length && !pwOk ? "help err" : "help"}>
                {senha.length && !pwOk ? `Faltam ${8 - senha.length} caracteres.` : "Pelo menos 8 caracteres."}
              </span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="step">
            <div>
              <h1 style={{ fontSize: 32 }}>Seus dados de saúde</h1>
              <p className="muted" style={{ marginTop: 6 }}>
                O exame que você procura é um dado sensível. Veja o que fazemos com ele.
              </p>
            </div>
            <div className="panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="bul">
                <Check />
                <span>Usamos o exame, o CPF e o endereço só para oferecer vagas e fazer a sua reserva.</span>
              </div>
              <div className="bul">
                <Check />
                <span>A clínica vê seus dados só depois que você reserva.</span>
              </div>
              <div className="bul">
                <Check />
                <span>Você pode apagar a conta quando quiser. Apagamos os dados 30 dias após o exame.</span>
              </div>
            </div>
            <label className="panel" style={{ display: "flex", gap: 12, padding: 16, cursor: "pointer", alignItems: "flex-start", background: "#fff" }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={() => setAgreed(!agreed)}
                style={{ width: 24, height: 24, accentColor: "#2a7f75", flex: "none", margin: 0 }}
              />
              <span style={{ fontWeight: 600 }}>Entendi e autorizo o uso dos meus dados de saúde para isso.</span>
            </label>
            {error && (
              <p className="help err" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {step < 3 && (
            <button type="button" className={valid ? "btn btn-primary btn-block" : "btn btn-block"} disabled={!valid} onClick={() => valid && setStep(step + 1)}>
              Continuar
            </button>
          )}
          {step === 3 &&
            (agreed ? (
              <button type="button" className="btn btn-primary btn-block" onClick={create} disabled={pending} aria-busy={pending}>
                {pending ? "Criando sua conta…" : "Criar minha conta"}
              </button>
            ) : (
              <button type="button" className="btn btn-block" disabled>
                Marque a autorização para continuar
              </button>
            ))}
          {step > 1 && (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep(Math.max(1, step - 1))}>
              Voltar
            </button>
          )}
          {step === 1 && (
            <Link className="btn btn-ghost btn-block" href="/paciente">
              Já tenho conta
            </Link>
          )}
          <form action={switchToDemoPatient} style={{ display: "flex", justifyContent: "center" }}>
            <button type="submit" className="demo">
              Usar paciente de demonstração
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
