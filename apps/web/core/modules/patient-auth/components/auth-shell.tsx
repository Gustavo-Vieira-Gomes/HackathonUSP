import Link from 'next/link';
import type { ReactNode } from 'react';

/** Moldura das telas de conta do paciente. */
export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <header className="masthead">
        <Link className="brand" href="/" aria-label="Hackathon USP, início">
          <span className="brand-mark" aria-hidden="true">
            H.
          </span>
          Hackathon USP
        </Link>
      </header>
      <section className="auth-shell" aria-labelledby="auth-title">
        <h1 id="auth-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}
