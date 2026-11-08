import Link from 'next/link';

export function ClinicHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="masthead">
      <Link className="brand" href="/" aria-label="Hackathon USP, início">
        <span className="brand-mark" aria-hidden="true">
          H.
        </span>
        Área da clínica
      </Link>
      {children}
    </header>
  );
}
