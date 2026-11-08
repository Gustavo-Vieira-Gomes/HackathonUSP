import Link from 'next/link';
import type { AuthFormState } from '../types/auth-form-state';

export function FormAlert({ state }: { state: AuthFormState }) {
  if (!state.message) return null;
  return (
    <div className="form-alert" role="alert">
      <p>
        {state.message}
        {state.messageLink && (
          <>
            {' '}
            <Link href={state.messageLink.href}>{state.messageLink.label}</Link>
          </>
        )}
      </p>
    </div>
  );
}
