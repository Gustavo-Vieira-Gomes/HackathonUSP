import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ClinicHeader } from '@/core/modules/clinic/components/clinic-header';
import { loadExamsPage } from '@/core/modules/clinic-exams/exams-page';
import ClinicExamsScreen from '@/core/modules/clinic-exams/screens/clinic-exams-screen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Exames da clínica' };

export default async function ClinicExamsPage() {
  const page = await loadExamsPage((await cookies()).toString());
  if (page.kind === 'redirect') redirect(page.to);
  return (
    <main>
      <ClinicHeader />
      <ClinicExamsScreen {...page} />
    </main>
  );
}
