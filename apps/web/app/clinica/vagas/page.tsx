import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ClinicHeader } from '@/core/modules/clinic/components/clinic-header';
import ClinicPanelScreen from '@/core/modules/clinic/screens/clinic-panel-screen';
import { getClinicExams } from '@/core/modules/clinic-exams/clinic-exams.service';
import { getClinicVacancies } from '@/core/modules/clinic-vacancies/clinic-vacancies.service';
import { VacanciesWorkspace } from '@/core/modules/clinic-vacancies/components/vacancies-workspace';
import { getSessionUser } from '@/core/shared/services/session.service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vagas da clínica' };

export default async function ClinicVacanciesPage() {
  const cookieHeader = (await cookies()).toString();
  const user = await getSessionUser(cookieHeader);
  if (!user) redirect('/clinica/login');
  if (user.role !== 'clinica')
    return (
      <main>
        <ClinicHeader />
        <ClinicPanelScreen kind="not-clinic" />
      </main>
    );
  const [exams, vacancies] = await Promise.all([
    getClinicExams(cookieHeader),
    getClinicVacancies(cookieHeader),
  ]);
  return (
    <main>
      <ClinicHeader />
      <section
        className="clinic-page exams-page"
        aria-labelledby="vacancies-title"
      >
        <p className="eyebrow">
          <Link href="/clinica">Painel da clínica</Link> · Vagas
        </p>
        <h1 id="vacancies-title" className="clinic-title">
          Vagas e reservas
        </h1>
        {exams.ok && vacancies.ok ? (
          <VacanciesWorkspace exams={exams.data} initial={vacancies.data} />
        ) : (
          <p className="form-alert" role="alert">
            Não foi possível carregar as vagas.{' '}
            <Link href="/clinica/vagas">Tentar novamente</Link>
          </p>
        )}
      </section>
    </main>
  );
}
