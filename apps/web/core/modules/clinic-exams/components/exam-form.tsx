'use client';

import type { Exam, ExamCatalogItem } from '@hackathon/contracts';
import { type FormEvent, useEffect, useState } from 'react';
import { type ExamFormErrorView, examFormErrorView } from '../exam-errors';
import {
  applyCatalogItem,
  type ExamFormValues,
  examToFormValues,
  initialExamForm,
  type StepForm,
  toExamBody,
} from '../exam-form-values';
import { TextField } from './text-field';

const MAX_STEPS = 5;
const EMPTY_ERRORS: ExamFormErrorView = { fieldErrors: {} };

interface ExamFormProps {
  catalog: ExamCatalogItem[];
  /** Exame em edição; ausente no modo de cadastro. */
  editing: Exam | null;
  onSaved: (notice: string) => void;
  onNotFound: (notice: string) => void;
  onCancel: () => void;
}

/** Id do elemento que recebe o foco para o caminho de erro da API. */
function focusTarget(path: string): string {
  if (path.startsWith('contraindications')) return 'exam-contraindications';
  return `exam-${path}`;
}

export function ExamForm({
  catalog,
  editing,
  onSaved,
  onNotFound,
  onCancel,
}: ExamFormProps) {
  const [values, setValues] = useState<ExamFormValues>(() =>
    editing
      ? examToFormValues(
          editing,
          catalog.find((item) => item.tussCode === editing.tussCode),
        )
      : initialExamForm(),
  );
  const [errors, setErrors] = useState<ExamFormErrorView>(EMPTY_ERRORS);
  const [submitting, setSubmitting] = useState(false);
  // Ao abrir a edição, o foco vai para o título do formulário (teclado e leitor de tela).
  useEffect(() => {
    if (editing) document.getElementById('exam-form-title')?.focus();
  }, [editing]);

  const set = (patch: Partial<ExamFormValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  const setStep = (index: number, patch: Partial<StepForm>) =>
    setValues((current) => ({
      ...current,
      priceSteps: current.priceSteps.map((step, i) =>
        i === index ? { ...step, ...patch } : step,
      ),
    }));

  const fieldError = (path: string) => errors.fieldErrors[path];
  const contraindicationErrors = Object.entries(errors.fieldErrors)
    .filter(([path]) => path.startsWith('contraindications'))
    .map(([, message]) => message);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors(EMPTY_ERRORS);
    let view: ExamFormErrorView;
    try {
      const response = await fetch(
        editing ? `/api/clinic/exams/${editing.id}` : '/api/clinic/exams',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            toExamBody(values, editing ? 'update' : 'create'),
          ),
        },
      );
      if (response.ok) {
        onSaved(editing ? 'Alterações salvas.' : 'Exame cadastrado.');
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      view = examFormErrorView(response.status, body);
    } catch {
      view = examFormErrorView(503, null);
    }
    setSubmitting(false);
    if (view.reload && view.general) {
      onNotFound(view.general);
      return;
    }
    setErrors(view);
    const target = view.firstField
      ? focusTarget(view.firstField)
      : 'exam-form-error';
    requestAnimationFrame(() => document.getElementById(target)?.focus());
  }

  const title = editing ? `Editar ${editing.name}` : 'Cadastrar exame';

  return (
    <form
      className="clinic-form exam-form"
      onSubmit={submit}
      noValidate
      aria-labelledby="exam-form-title"
    >
      <h2 id="exam-form-title" className="form-title" tabIndex={-1}>
        {title}
      </h2>
      {errors.general ? (
        <p
          id="exam-form-error"
          className="form-alert"
          role="alert"
          tabIndex={-1}
        >
          {errors.general}
        </p>
      ) : null}

      <fieldset className="form-group">
        <legend>Exame</legend>
        {editing ? (
          <p className="exam-fixed">
            <span className="field-label">Exame</span>
            <strong>{editing.name}</strong>
            <span className="field-hint">
              TUSS {editing.tussCode}. Para trocar de exame, cadastre outro.
            </span>
          </p>
        ) : (
          <div className="field">
            <label htmlFor="exam-tussCode">Exame</label>
            <select
              id="exam-tussCode"
              value={values.tussCode}
              aria-invalid={fieldError('tussCode') ? true : undefined}
              aria-describedby={
                fieldError('tussCode') ? 'exam-tussCode-error' : undefined
              }
              onChange={(event) => {
                const item = catalog.find(
                  (entry) => entry.tussCode === event.target.value,
                );
                setValues((current) =>
                  item
                    ? applyCatalogItem(current, item)
                    : {
                        ...current,
                        tussCode: '',
                        contraindications: [],
                        contraindicationOptions: [],
                      },
                );
              }}
            >
              <option value="">Escolha o exame</option>
              {catalog.map((item) => (
                <option key={item.tussCode} value={item.tussCode}>
                  {item.name} (TUSS {item.tussCode})
                </option>
              ))}
            </select>
            {fieldError('tussCode') ? (
              <div id="exam-tussCode-error" className="field-error">
                <p>{fieldError('tussCode')}</p>
                {errors.allowedExamNames ? (
                  <>
                    <p>Exames aceitos:</p>
                    <ul>
                      {errors.allowedExamNames.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </fieldset>

      <fieldset className="form-group">
        <legend>Preço</legend>
        <div className="field-grid">
          <TextField
            id="exam-fullPriceCents"
            label="Preço cheio (R$)"
            inputMode="decimal"
            hint="Em reais, por exemplo 720,00."
            value={values.fullPrice}
            error={fieldError('fullPriceCents')}
            onChange={(fullPrice) => set({ fullPrice })}
          />
          <TextField
            id="exam-floorPriceCents"
            label="Piso (R$)"
            inputMode="decimal"
            hint="O preço com desconto nunca fica abaixo do piso."
            value={values.floorPrice}
            error={fieldError('floorPriceCents')}
            onChange={(floorPrice) => set({ floorPrice })}
          />
        </div>
        <fieldset className="steps">
          <legend id="exam-priceSteps" tabIndex={-1}>
            Degraus de desconto por antecedência
          </legend>
          {fieldError('priceSteps') ? (
            <p className="field-error">{fieldError('priceSteps')}</p>
          ) : null}
          <ol className="step-list">
            {values.priceSteps.map((step, index) => (
              <li className="step-row" key={index}>
                <TextField
                  id={`exam-priceSteps.${index}.leadMinutes`}
                  label={`Degrau ${index + 1}: faltando até (horas)`}
                  inputMode="numeric"
                  value={step.hours}
                  error={fieldError(`priceSteps.${index}.leadMinutes`)}
                  onChange={(hours) => setStep(index, { hours })}
                />
                <TextField
                  id={`exam-priceSteps.${index}.discountPercent`}
                  label={`Degrau ${index + 1}: desconto (%)`}
                  inputMode="numeric"
                  value={step.discountPercent}
                  error={fieldError(`priceSteps.${index}.discountPercent`)}
                  onChange={(discountPercent) =>
                    setStep(index, { discountPercent })
                  }
                />
                <button
                  type="button"
                  className="link-button"
                  disabled={values.priceSteps.length <= 1}
                  onClick={() =>
                    set({
                      priceSteps: values.priceSteps.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  Remover<span className="sr-only"> degrau {index + 1}</span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="secondary-button"
            disabled={values.priceSteps.length >= MAX_STEPS}
            onClick={() =>
              set({
                priceSteps: [
                  ...values.priceSteps,
                  { hours: '', discountPercent: '' },
                ],
              })
            }
          >
            Adicionar degrau
          </button>
        </fieldset>
      </fieldset>

      <fieldset className="form-group">
        <legend>Encaixe e preparo</legend>
        <div className="field-grid">
          <TextField
            id="exam-minLeadMinutes"
            label="Antecedência mínima para encaixe (horas)"
            inputMode="numeric"
            value={values.minLeadHours}
            error={fieldError('minLeadMinutes')}
            onChange={(minLeadHours) => set({ minLeadHours })}
          />
          <TextField
            id="exam-preparationHours"
            label="Preparo: horas antes do exame"
            inputMode="numeric"
            value={values.preparationHours}
            error={fieldError('preparationHours')}
            onChange={(preparationHours) => set({ preparationHours })}
          />
        </div>
        <div className="field">
          <label htmlFor="exam-preparationCondition">Preparo</label>
          <textarea
            id="exam-preparationCondition"
            rows={3}
            value={values.preparationCondition}
            aria-invalid={fieldError('preparationCondition') ? true : undefined}
            aria-describedby={
              fieldError('preparationCondition')
                ? 'exam-preparationCondition-error'
                : 'exam-preparationCondition-hint'
            }
            onChange={(event) =>
              set({ preparationCondition: event.target.value })
            }
          />
          <p id="exam-preparationCondition-hint" className="field-hint">
            Vem do questionário do exame; ajuste ao protocolo da clínica.
          </p>
          {fieldError('preparationCondition') ? (
            <p id="exam-preparationCondition-error" className="field-error">
              {fieldError('preparationCondition')}
            </p>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="form-group">
        <legend id="exam-contraindications" tabIndex={-1}>
          Contraindicações
        </legend>
        {contraindicationErrors.length ? (
          <p className="field-error">{contraindicationErrors[0]}</p>
        ) : null}
        {!values.tussCode ? (
          <p className="field-hint">
            Escolha um exame para ver as contraindicações do questionário.
          </p>
        ) : values.contraindicationOptions.length === 0 ? (
          <p className="field-hint">
            O questionário deste exame não tem contraindicações.
          </p>
        ) : (
          <ul className="check-list">
            {values.contraindicationOptions.map((option) => {
              const id = `exam-contraindication-${option.id}`;
              return (
                <li key={option.id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={values.contraindications.includes(option.id)}
                    onChange={(event) =>
                      set({
                        contraindications: event.target.checked
                          ? [...values.contraindications, option.id]
                          : values.contraindications.filter(
                              (item) => item !== option.id,
                            ),
                      })
                    }
                  />
                  <label htmlFor={id}>{option.question}</label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset className="form-group">
        <legend>Atraso e no-show</legend>
        <div className="field-grid">
          <TextField
            id="exam-toleranceMinutes"
            label="X: tolerância de atraso (minutos)"
            inputMode="numeric"
            value={values.toleranceMinutes}
            error={fieldError('toleranceMinutes')}
            onChange={(toleranceMinutes) => set({ toleranceMinutes })}
          />
          <TextField
            id="exam-maxTravelMinutes"
            label="Y: tempo máximo para chegar (minutos)"
            inputMode="numeric"
            value={values.maxTravelMinutes}
            error={fieldError('maxTravelMinutes')}
            onChange={(maxTravelMinutes) => set({ maxTravelMinutes })}
          />
        </div>
      </fieldset>

      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting
            ? 'Salvando…'
            : editing
              ? 'Salvar alterações'
              : 'Cadastrar exame'}
        </button>
        {editing ? (
          <button
            type="button"
            className="secondary-button"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancelar edição
          </button>
        ) : null}
      </div>
    </form>
  );
}
