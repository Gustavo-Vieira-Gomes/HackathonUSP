'use server';

import type { ApiError } from '@hackathon/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  CONSENT_REQUIRED_MESSAGE,
  EMAIL_IN_USE_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  RATE_LIMITED_MESSAGE,
  SIGN_IN_FIELD_MESSAGES,
  SIGN_UP_FIELD_MESSAGES,
  UNAVAILABLE_MESSAGE,
} from '../constants/messages';
import {
  signInPatient,
  signOutPatient,
  signUpPatient,
} from '../services/patient-auth.server.service';
import {
  parseSessionSetCookie,
  readSessionCookie,
} from '../services/session-cookie';
import type { AuthField, AuthFormState } from '../types/auth-form-state';

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function fieldErrors(
  error: ApiError,
  messages: Partial<Record<AuthField, string>>,
): AuthFormState['fieldErrors'] {
  const errors: AuthFormState['fieldErrors'] = {};
  for (const field of error.fields ?? []) {
    const message = messages[field as AuthField];
    if (message) errors[field as AuthField] = message;
  }
  return errors;
}

/** Grava na origem do Next o cookie de sessão emitido pelo Nest (AD-003). */
async function storeSession(setCookies: string[]): Promise<boolean> {
  const session = parseSessionSetCookie(setCookies);
  if (!session || session.maxAge <= 0) return false;
  (await cookies()).set(session.name, session.value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: session.maxAge,
    secure: session.secure,
  });
  return true;
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = {
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
  };
  const outcome = await signUpPatient({
    ...values,
    password: text(formData, 'password'),
    healthDataConsent: formData.get('healthDataConsent') === 'on',
    consentTermVersion: text(formData, 'consentTermVersion'),
  });

  if (outcome.kind === 'ok') {
    if (!(await storeSession(outcome.setCookies))) {
      return { values, message: UNAVAILABLE_MESSAGE };
    }
    redirect('/minha-conta');
  }
  if (outcome.kind === 'unavailable') {
    return { values, message: UNAVAILABLE_MESSAGE };
  }
  switch (outcome.error.code) {
    case 'consent_required':
      return { values, fieldErrors: { consent: CONSENT_REQUIRED_MESSAGE } };
    case 'email_in_use':
      return {
        values,
        message: EMAIL_IN_USE_MESSAGE,
        messageLink: { href: '/entrar', label: 'Entrar' },
        fieldErrors: { email: EMAIL_IN_USE_MESSAGE },
      };
    case 'validation_failed':
      return {
        values,
        fieldErrors: fieldErrors(outcome.error, SIGN_UP_FIELD_MESSAGES),
      };
    default:
      return { values, message: UNAVAILABLE_MESSAGE };
  }
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: text(formData, 'email') };
  const outcome = await signInPatient({
    email: values.email,
    password: text(formData, 'password'),
  });

  if (outcome.kind === 'ok') {
    if (!(await storeSession(outcome.setCookies))) {
      return { values, message: UNAVAILABLE_MESSAGE };
    }
    redirect('/minha-conta');
  }
  if (outcome.kind === 'unavailable') {
    return { values, message: UNAVAILABLE_MESSAGE };
  }
  switch (outcome.error.code) {
    case 'invalid_credentials':
      return { values, message: INVALID_CREDENTIALS_MESSAGE };
    case 'rate_limited':
      return { values, message: RATE_LIMITED_MESSAGE };
    case 'validation_failed':
      return {
        values,
        fieldErrors: fieldErrors(outcome.error, SIGN_IN_FIELD_MESSAGES),
      };
    default:
      return { values, message: UNAVAILABLE_MESSAGE };
  }
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  const session = readSessionCookie(store);
  if (session) {
    await signOutPatient(session);
    store.set(session.name, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      secure: session.name.startsWith('__Secure-'),
    });
  }
  redirect('/entrar');
}
