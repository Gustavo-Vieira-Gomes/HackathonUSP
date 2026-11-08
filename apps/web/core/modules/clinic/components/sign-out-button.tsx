'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Encerra a sessão pelo Better Auth (proxy do Next) e volta ao login da clínica. */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (response.ok) {
        router.push('/clinica/login');
        router.refresh();
        return;
      }
    } catch {
      // cai no aviso abaixo
    }
    setFailed(true);
    setPending(false);
  }

  return (
    <div className="sign-out">
      <button
        className="secondary-button"
        type="button"
        onClick={signOut}
        disabled={pending}
      >
        {pending ? 'Saindo…' : 'Sair'}
      </button>
      {failed ? (
        <p className="field-error" role="alert">
          Não foi possível sair agora. Tente de novo em instantes.
        </p>
      ) : null}
    </div>
  );
}
