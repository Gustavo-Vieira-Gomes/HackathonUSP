import Link from 'next/link';

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main>
      <header className="masthead">
        <Link className="brand" href="/" aria-label="Hackathon USP, início">
          <span className="brand-mark" aria-hidden="true">
            H.
          </span>
          Área do paciente
        </Link>
      </header>
      {children}
    </main>
  );
}
