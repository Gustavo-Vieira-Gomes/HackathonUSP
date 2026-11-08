'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { patientAuthError } from '../auth-errors';
import { normalizePhoneInput } from '../phone-input';

export function PatientAuthForm({ mode }: { mode: 'cadastro' | 'login' }) {
  const registering = mode === 'cadastro';
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const body = {
      email: String(values.get('email') ?? ''),
      password: String(values.get('password') ?? ''),
      ...(registering
        ? {
            name: String(values.get('name') ?? ''),
            phone: normalizePhoneInput(String(values.get('phone') ?? '')),
            healthDataConsent: values.get('healthDataConsent') === 'on',
          }
        : {}),
    };
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        registering ? '/api/sign-up/paciente' : '/api/auth/sign-in/email',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.ok) {
        router.push('/paciente');
        router.refresh();
        return;
      }
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        /* A falha pode vir de um proxy sem JSON. */
      }
      setError(patientAuthError(response.status, payload));
    } catch {
      setError('O serviço está indisponível. Tente novamente em instantes.');
    }
    setPending(false);
    requestAnimationFrame(() =>
      document.getElementById('patient-auth-error')?.focus(),
    );
  }

  return (
    <section className="patient-page" aria-labelledby="patient-auth-title">
      <p className="eyebrow">Área do paciente</p>
      <h1 id="patient-auth-title" className="clinic-title">
        {registering ? 'Criar minha conta' : 'Entrar'}
      </h1>
      <p className="intro">
        {registering ? 'Já tem conta? ' : 'Ainda não tem conta? '}
        <Link href={registering ? '/paciente/login' : '/paciente/cadastro'}>
          {registering ? 'Entrar' : 'Cadastrar'}
        </Link>
      </p>
      <form className="clinic-form" onSubmit={submit} aria-busy={pending}>
        {error && (
          <p
            id="patient-auth-error"
            className="form-alert"
            role="alert"
            tabIndex={-1}
          >
            {error}
          </p>
        )}
        <fieldset className="patient-fields" disabled={pending}>
          <legend className="sr-only">
            {registering ? 'Dados de cadastro' : 'Dados de acesso'}
          </legend>
          {registering && (
            <div className="field">
              <label htmlFor="patient-name">Nome completo</label>
              <input
                id="patient-name"
                name="name"
                autoComplete="name"
                maxLength={120}
                required
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="patient-email">E-mail</label>
            <input
              id="patient-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </div>
          {registering && (
            <div className="field">
              <label htmlFor="patient-phone">Telefone com DDD</label>
              <input
                id="patient-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={20}
                placeholder="(11) 99999-9999"
                required
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="patient-password">Senha</label>
            <input
              id="patient-password"
              name="password"
              type="password"
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              required
              aria-describedby={
                registering ? 'patient-password-hint' : undefined
              }
            />
            {registering && (
              <p className="field-hint" id="patient-password-hint">
                Use de 8 a 128 caracteres.
              </p>
            )}
          </div>
          {registering && (
            <section
              className="patient-consent"
              aria-labelledby="consent-title"
            >
              <h2 id="consent-title" className="form-title">
                Consentimento para dados de saúde
              </h2>
              <p id="consent-description">
                Autorizo o tratamento dos meus dados de saúde para minhas
                inscrições em listas de encaixe e reservas de exames. Somente
                minhas próprias reservas e inscrições ficam acessíveis na minha
                conta. Esses dados serão apagados 30 dias após o exame ou a
                expiração.
              </p>
              <label className="patient-consent-label">
                <input
                  type="checkbox"
                  name="healthDataConsent"
                  required
                  aria-describedby="consent-description"
                />
                Li e aceito o termo de consentimento para tratamento de dados de
                saúde.
              </label>
              <p className="field-hint">
                O aceite é obrigatório e será registrado com data e hora.
              </p>
            </section>
          )}
        </fieldset>
        <button className="primary-button" disabled={pending} type="submit">
          {pending
            ? registering
              ? 'Criando conta…'
              : 'Entrando…'
            : registering
              ? 'Criar conta e entrar'
              : 'Entrar'}
        </button>
      </form>
    </section>
  );
}
