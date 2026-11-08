interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  inputMode?: 'numeric' | 'decimal';
  suffix?: string;
}

/** Campo com `<label>`, dica e erro ligados por `aria-describedby`. */
export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  inputMode,
  suffix,
}: TextFieldProps) {
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={suffix ? 'field-with-suffix' : undefined}>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span aria-hidden="true">{suffix}</span> : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
