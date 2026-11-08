'use client';

import { useActionState, useRef } from 'react';
import { signInAction } from '../actions/patient-auth.actions';
import type { AuthFormState } from '../types/auth-form-state';
import { FormAlert } from './form-alert';
import { FormField } from './form-field';
import { useFocusFirstError } from './use-focus-first-error';

const initialState: AuthFormState = {};

export function SignInForm() {
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialState,
  );
  const form = useRef<HTMLFormElement>(null);
  useFocusFirstError(state, form);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={form} action={formAction} className="auth-form">
      <FormAlert state={state} />
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
        id="password"
        name="password"
        type="password"
        label="Senha"
        autoComplete="current-password"
        required
        error={errors.password}
      />
      <button type="submit" className="button" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
