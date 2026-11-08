import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadClinicPanel } from '@/core/modules/clinic/clinic-panel';
import { ClinicHeader } from '@/core/modules/clinic/components/clinic-header';
import ClinicPanelScreen from '@/core/modules/clinic/screens/clinic-panel-screen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Painel da clínica' };

export default async function ClinicPanelPage() {
  const panel = await loadClinicPanel((await cookies()).toString());
  if (panel.kind === 'redirect') redirect(panel.to);
  return (
    <main>
      <ClinicHeader />
      <ClinicPanelScreen {...panel} />
    </main>
  );
}
