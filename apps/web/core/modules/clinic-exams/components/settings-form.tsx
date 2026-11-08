'use client';

import type { ClinicSettings } from '@hackathon/contracts';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { type ExamFormErrorView, examFormErrorView } from '../exam-errors';
import { TextField } from './text-field';

const EMPTY_ERRORS: ExamFormErrorView = { fieldErrors: {} };

const toInt = (text: string): number | null =>
  /^-?\d+$/.test(text.trim()) ? Number(text.trim()) : null;

/** Sinal (RN-40) e teto diário de vagas com desconto (RN-28) da clínica. */
export function SettingsForm({ settings }: { settings: ClinicSettings }) {
  const router = useRouter();
  const [values, setValues] = useState({
    depositPercent: String(settings.depositPercent),
    dailyDiscountCap: String(settings.dailyDiscountCap),
  });
  const [errors, setErrors] = useState<ExamFormErrorView>(EMPTY_ERRORS);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSaved(false);
    setErrors(EMPTY_ERRORS);
    let view: ExamFormErrorView;
    try {
      const response = await fetch('/api/clinic/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          depositPercent: toInt(values.depositPercent),
          dailyDiscountCap: toInt(values.dailyDiscountCap),
        }),
      });
      if (response.ok) {
        setSubmitting(false);
        setSaved(true);
        router.refresh();
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      view = examFormErrorView(response.status, body);
    } catch {
      view = examFormErrorView(503, null);
    }
    setSubmitting(false);
    setErrors(view);
    const target = view.firstField
      ? `settings-${view.firstField}`
      : 'settings-form-error';
    requestAnimationFrame(() => document.getElementById(target)?.focus());
  }

  return (
    <form
      className="clinic-form settings-form"
      onSubmit={submit}
      noValidate
      aria-labelledby="settings-title"
    >
      <h2 id="settings-title" className="form-title">
        Sinal e teto diário
      </h2>
      {errors.general ? (
        <p
          id="settings-form-error"
          className="form-alert"
          role="alert"
          tabIndex={-1}
        >
          {errors.general}
        </p>
      ) : null}
      {saved ? (
        <p className="form-success" role="status">
          Configuração salva.
        </p>
      ) : null}
      <fieldset className="form-group">
        <legend>Padrões da clínica para vagas de encaixe</legend>
        <div className="field-grid">
          <TextField
            id="settings-depositPercent"
            label="Sinal (% do preço da vaga)"
            inputMode="numeric"
            hint="Cobrado na reserva; de 1% a 100%."
            value={values.depositPercent}
            error={errors.fieldErrors.depositPercent}
            onChange={(depositPercent) =>
              setValues((current) => ({ ...current, depositPercent }))
            }
          />
          <TextField
            id="settings-dailyDiscountCap"
            label="Teto diário de vagas com desconto"
            inputMode="numeric"
            hint="Quantas vagas com desconto a clínica publica por dia."
            value={values.dailyDiscountCap}
            error={errors.fieldErrors.dailyDiscountCap}
            onChange={(dailyDiscountCap) =>
              setValues((current) => ({ ...current, dailyDiscountCap }))
            }
          />
        </div>
      </fieldset>
      <button className="primary-button" type="submit" disabled={submitting}>
        {submitting ? 'Salvando…' : 'Salvar sinal e teto'}
      </button>
    </form>
  );
}
