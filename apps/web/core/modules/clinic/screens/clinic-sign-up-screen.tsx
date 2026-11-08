'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { type DayForm, toOpeningHours, WEEKDAYS } from '../opening-hours';
import { type SignUpErrorView, signUpErrorView } from '../sign-up-errors';

type TextField =
  'name' | 'cnes' | 'technicalManager' | 'address' | 'email' | 'password';

const TEXT_FIELDS: {
  id: TextField;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
  inputMode?: 'numeric';
}[] = [
  {
    id: 'name',
    label: 'Nome da clínica',
    type: 'text',
    autoComplete: 'organization',
  },
  {
    id: 'cnes',
    label: 'CNES',
    type: 'text',
    autoComplete: 'off',
    inputMode: 'numeric',
    hint: '7 dígitos, como no cadastro nacional.',
  },
  {
    id: 'technicalManager',
    label: 'Responsável técnico (nome e CRM)',
    type: 'text',
    autoComplete: 'off',
    hint: 'Ex.: Dra. Ana Lima, CRM-SP 123456',
  },
  {
    id: 'address',
    label: 'Endereço',
    type: 'text',
    autoComplete: 'street-address',
    hint: 'Rua, número, bairro e cidade. Usamos para localizar a clínica no mapa.',
  },
  {
    id: 'email',
    label: 'E-mail de acesso',
    type: 'email',
    autoComplete: 'email',
  },
  {
    id: 'password',
    label: 'Senha',
    type: 'password',
    autoComplete: 'new-password',
    hint: 'Mínimo de 8 caracteres.',
  },
];

const INITIAL_DAYS: DayForm[] = WEEKDAYS.map(({ weekday }) => ({
  weekday,
  closed: weekday === 0,
  open: '08:00',
  close: weekday === 6 ? '12:00' : '18:00',
}));

const EMPTY_ERRORS: SignUpErrorView = { fieldErrors: {} };

export default function ClinicSignUpScreen() {
  const router = useRouter();
  const [values, setValues] = useState<Record<TextField, string>>({
    name: '',
    cnes: '',
    technicalManager: '',
    address: '',
    email: '',
    password: '',
  });
  const [days, setDays] = useState<DayForm[]>(INITIAL_DAYS);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<SignUpErrorView>(EMPTY_ERRORS);

  const updateDay = (weekday: number, patch: Partial<DayForm>) =>
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday ? { ...day, ...patch } : day,
      ),
    );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors(EMPTY_ERRORS);
    const openingHours = toOpeningHours(days);
    let view: SignUpErrorView;
    try {
      const response = await fetch('/api/sign-up/clinica', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...values, openingHours }),
      });
      if (response.ok) {
        router.push('/clinica');
        router.refresh();
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      view = signUpErrorView(response.status, body, openingHours);
    } catch {
      view = signUpErrorView(503, null, openingHours);
    }
    setErrors(view);
    setSubmitting(false);
    const target = view.firstField ?? 'form-error';
    requestAnimationFrame(() => document.getElementById(target)?.focus());
  }

  const describedBy = (id: string, hint?: string) =>
    [hint ? `${id}-hint` : '', errors.fieldErrors[id] ? `${id}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <section className="clinic-page" aria-labelledby="sign-up-title">
      <p className="eyebrow">Cadastro de clínica</p>
      <h1 id="sign-up-title" className="clinic-title">
        Publique suas vagas ociosas.
      </h1>
      <p className="intro">
        Cadastre a clínica com CNES, responsável técnico, endereço e expediente.
        Já tem conta? <Link href="/clinica/login">Entrar</Link>
      </p>

      <form className="clinic-form" onSubmit={submit} noValidate>
        {errors.general ? (
          <p id="form-error" className="form-alert" role="alert" tabIndex={-1}>
            {errors.general}
          </p>
        ) : null}

        <fieldset className="form-group">
          <legend>Dados da clínica e acesso</legend>
          <div className="field-grid">
            {TEXT_FIELDS.map((field) => (
              <div className="field" key={field.id}>
                <label htmlFor={field.id}>{field.label}</label>
                <input
                  id={field.id}
                  name={field.id}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  inputMode={field.inputMode}
                  required
                  value={values[field.id]}
                  aria-invalid={errors.fieldErrors[field.id] ? true : undefined}
                  aria-describedby={describedBy(field.id, field.hint)}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))
                  }
                />
                {field.hint ? (
                  <p id={`${field.id}-hint`} className="field-hint">
                    {field.hint}
                  </p>
                ) : null}
                {errors.fieldErrors[field.id] ? (
                  <p id={`${field.id}-error`} className="field-error">
                    {errors.fieldErrors[field.id]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset
          className="form-group"
          aria-describedby={
            errors.fieldErrors.openingHours ? 'openingHours-error' : undefined
          }
        >
          <legend id="openingHours" tabIndex={-1}>
            Expediente (hora de São Paulo)
          </legend>
          {errors.fieldErrors.openingHours ? (
            <p id="openingHours-error" className="field-error">
              {errors.fieldErrors.openingHours}
            </p>
          ) : null}
          <ul className="week">
            {WEEKDAYS.map(({ weekday, label }) => {
              const day = days[weekday]!;
              const on = `${weekday === 0 || weekday === 6 ? 'no' : 'na'} ${label.toLowerCase()}`;
              return (
                <li className="day" key={weekday}>
                  <span className="day-name" id={`day-${weekday}`}>
                    {label}
                  </span>
                  <label className="day-closed" htmlFor={`closed-${weekday}`}>
                    <input
                      id={`closed-${weekday}`}
                      type="checkbox"
                      checked={day.closed}
                      onChange={(event) =>
                        updateDay(weekday, { closed: event.target.checked })
                      }
                    />
                    Fechado<span className="sr-only"> {on}</span>
                  </label>
                  {(['open', 'close'] as const).map((part) => {
                    const id = `${part}-${weekday}`;
                    return (
                      <div className="field day-time" key={part}>
                        <label htmlFor={id}>
                          {part === 'open' ? 'Abertura' : 'Fechamento'}
                          <span className="sr-only"> {on}</span>
                        </label>
                        <input
                          id={id}
                          type="time"
                          step={60}
                          disabled={day.closed}
                          value={day[part]}
                          aria-invalid={
                            errors.fieldErrors[id] ? true : undefined
                          }
                          aria-describedby={
                            errors.fieldErrors[id] ? `${id}-error` : undefined
                          }
                          onChange={(event) =>
                            updateDay(weekday, { [part]: event.target.value })
                          }
                        />
                        {errors.fieldErrors[id] ? (
                          <p id={`${id}-error`} className="field-error">
                            {errors.fieldErrors[id]}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </fieldset>

        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? 'Cadastrando…' : 'Cadastrar clínica'}
        </button>
      </form>
    </section>
  );
}
