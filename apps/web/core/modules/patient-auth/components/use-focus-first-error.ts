'use client';

import { type RefObject, useEffect } from 'react';
import { AUTH_FIELD_ORDER, type AuthFormState } from '../types/auth-form-state';

/** Depois de um envio com erro, leva o foco ao primeiro campo inválido. */
export function useFocusFirstError(
  state: AuthFormState,
  form: RefObject<HTMLFormElement | null>,
): void {
  useEffect(() => {
    const errors = state.fieldErrors ?? {};
    const first = AUTH_FIELD_ORDER.find((field) => errors[field]);
    if (!first) return;
    const element = form.current?.elements.namedItem(
      first === 'consent' ? 'healthDataConsent' : first,
    );
    if (element instanceof HTMLElement) element.focus();
  }, [state, form]);
}
