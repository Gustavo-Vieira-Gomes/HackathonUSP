'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  signUpResponseSchema,
  patientSignUpBodySchema,
} from '@hackathon/contracts';

export function PatientAuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      email: String(data.get('email')),
      password: String(data.get('password')),
      ...(register
        ? {
            name: String(data.get('name')),
            phone: String(data.get('phone')),
            healthDataConsent: data.get('healthDataConsent') === 'on',
          }
        : {}),
    };
    if (register && !patientSignUpBodySchema.safeParse(body).success) {
      setMessage('Confira os dados e aceite o consentimento obrigatório.');
      return;
    }
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(
        register ? '/api/sign-up/paciente' : '/api/auth/sign-in/email',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) {
        setMessage(
          response.status >= 500
            ? 'Serviço indisponível. Tente novamente.'
            : register
              ? 'Não foi possível criar a conta. Confira os dados ou entre com sua conta existente.'
              : 'E-mail ou senha inválidos.',
        );
        return;
      }
      if (register) signUpResponseSchema.parse(await response.json());
      router.push('/');
      router.refresh();
    } catch {
      setMessage('Não foi possível conectar. Tente novamente.');
    } finally {
      setPending(false);
    }
  }
  return (
    <main>
      <header className="masthead">
        <Link className="brand" href="/">
          Hackathon USP
        </Link>
      </header>
      <section className="foundation">
        <h1>{register ? 'Criar conta' : 'Entrar'}</h1>
        <form onSubmit={handleSubmit} aria-busy={pending}>
          {register && (
            <p>
              <label>
                Nome
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={120}
                />
              </label>
            </p>
          )}
          <p>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
          </p>
          {register && (
            <p>
              <label>
                Telefone para WhatsApp
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  pattern="\+?[0-9]{10,15}"
                  placeholder="+5511999990000"
                  required
                />
              </label>
            </p>
          )}
          <p>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={8}
                maxLength={128}
                required
              />
            </label>
          </p>
          {register && (
            <fieldset>
              <legend>Consentimento para dados de saúde</legend>
              <p>
                Autorizo o tratamento dos meus dados de saúde para buscar vagas
                de exames, gerenciar minhas inscrições e reservas e enviar
                alertas pelos canais escolhidos. Somente minhas próprias
                inscrições e reservas ficam acessíveis na minha conta. Os dados
                de reservas e inscrições serão apagados 30 dias após o exame ou
                a expiração.
              </p>
              <label>
                <input name="healthDataConsent" type="checkbox" required /> Li e
                aceito o tratamento de dados de saúde para essas finalidades.
              </label>
            </fieldset>
          )}
          <p role="alert">{message}</p>
          <button className="primary-link" disabled={pending}>
            {pending
              ? 'Aguarde…'
              : register
                ? 'Criar conta e entrar'
                : 'Entrar'}
          </button>
        </form>
        <p>
          <Link href={register ? '/paciente/login' : '/paciente/cadastro'}>
            {register ? 'Já tenho conta' : 'Criar conta de paciente'}
          </Link>
        </p>
      </section>
    </main>
  );
}
