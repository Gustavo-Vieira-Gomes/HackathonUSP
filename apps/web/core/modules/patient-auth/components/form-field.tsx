import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

/** Campo com rótulo, dica e erro ligados por `aria-describedby`. */
export function FormField({
  id,
  label,
  error,
  hint,
  ...input
}: FormFieldProps) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
