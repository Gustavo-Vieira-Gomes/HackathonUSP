'use client';

import { useActionState, useRef } from 'react';
import { signUpAction } from '../actions/patient-auth.actions';
import { CONSENT_TERM } from '../constants/consent-term';
import type { AuthFormState } from '../types/auth-form-state';
import { FormAlert } from './form-alert';
import { FormField } from './form-field';
import { useFocusFirstError } from './use-focus-first-error';

const initialState: AuthFormState = {};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(
    signUpAction,
    initialState,
  );
  const form = useRef<HTMLFormElement>(null);
  useFocusFirstError(state, form);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={form} action={formAction} className="auth-form">
      <FormAlert state={state} />
      <FormField
        id="name"
        name="name"
        label="Nome"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        error={errors.name}
      />
      <FormField
        id="email"
        name="email"
        type="email"
        label="E-mail"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={errors.email}
      />
      <FormField
        id="phone"
        name="phone"
        type="tel"
        label="Telefone"
        hint="Com DDD, por exemplo (11) 98765-4321."
        autoComplete="tel-national"
        required
        defaultValue={state.values?.phone}
        error={errors.phone}
      />
      <FormField
        id="password"
        name="password"
        type="password"
        label="Senha"
        hint="De 8 a 128 caracteres."
        autoComplete="new-password"
        required
        error={errors.password}
      />

      <section className="consent-term" aria-labelledby="consent-title">
        <h2 id="consent-title">{CONSENT_TERM.title}</h2>
        <p className="placeholder-notice">
          <strong>{CONSENT_TERM.placeholderNotice}</strong> · versão{' '}
          {CONSENT_TERM.version}
        </p>
        {CONSENT_TERM.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>
      <input
        type="hidden"
        name="consentTermVersion"
        value={CONSENT_TERM.version}
      />
      <div className="consent-field">
        <input
          id="healthDataConsent"
          name="healthDataConsent"
          type="checkbox"
          aria-invalid={errors.consent ? true : undefined}
          aria-describedby={errors.consent ? 'consent-error' : undefined}
        />
        <label htmlFor="healthDataConsent">{CONSENT_TERM.checkboxLabel}</label>
        {errors.consent && (
          <p className="field-error" id="consent-error">
            {errors.consent}
          </p>
        )}
      </div>

      <button type="submit" className="button" disabled={pending}>
        {pending ? 'Criando conta…' : 'Criar conta'}
      </button>
    </form>
  );
}
