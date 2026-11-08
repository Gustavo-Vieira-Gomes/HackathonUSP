import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/core/shared/services/session.service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Minha conta · Paciente' };

export default async function PatientPage() {
  const user = await getSessionUser((await cookies()).toString());
  if (!user) redirect('/paciente/login');
  if (user.role !== 'paciente') {
    return (
      <section className="patient-page">
        <h1 className="clinic-title">Esta conta é de clínica</h1>
        <p className="intro">Acesse sua área para continuar.</p>
        <Link href="/clinica">Ir para a área da clínica</Link>
      </section>
    );
  }
  return (
    <section className="patient-page">
      <p className="eyebrow">Minha conta</p>
      <h1 className="clinic-title">Olá, {user.name}</h1>
      <p className="intro">
        Encontre oportunidades de encaixe nos horários em que você pode ir.
      </p>
      <Link className="primary-link" href="/paciente/inscricoes">
        Minha lista de encaixe
      </Link>
    </section>
  );
}
