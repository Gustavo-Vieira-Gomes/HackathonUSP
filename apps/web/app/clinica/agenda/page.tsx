import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadClinicCalendarPage } from '@/core/modules/clinic-calendar/clinic-calendar-page';
import ClinicCalendarScreen from '@/core/modules/clinic-calendar/screens/clinic-calendar-screen';
import { ClinicHeader } from '@/core/modules/clinic/components/clinic-header';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Google Agenda da clínica' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function ClinicCalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = await loadClinicCalendarPage(
    (await cookies()).toString(),
    single(params.google),
    single(params.acao),
  );
  if (page.kind === 'redirect') redirect(page.to);
  return (
    <main>
      <ClinicHeader />
      <ClinicCalendarScreen {...page} />
    </main>
  );
}
