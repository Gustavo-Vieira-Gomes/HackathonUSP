'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const INVALID = 'E-mail ou senha inválidos.';
const UNAVAILABLE =
  'O serviço está indisponível no momento. Tente de novo em instantes.';

export default function ClinicLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    let message = UNAVAILABLE;
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        router.push('/clinica');
        router.refresh();
        return;
      }
      if (response.status === 400 || response.status === 401) message = INVALID;
    } catch {
      message = UNAVAILABLE;
    }
    setError(message);
    setPassword('');
    setSubmitting(false);
    requestAnimationFrame(() =>
      document.getElementById('login-error')?.focus(),
    );
  }

  return (
    <section
      className="clinic-page clinic-narrow"
      aria-labelledby="login-title"
    >
      <p className="eyebrow">Área da clínica</p>
      <h1 id="login-title" className="clinic-title">
        Entrar
      </h1>
      <p className="intro">
        Ainda não cadastrou a clínica?{' '}
        <Link href="/clinica/cadastro">Cadastrar clínica</Link>
      </p>
      <form className="clinic-form" onSubmit={submit} noValidate>
        {error ? (
          <p id="login-error" className="form-alert" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </section>
  );
}
