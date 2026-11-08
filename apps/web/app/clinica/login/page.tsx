import type { Metadata } from 'next';
import { ClinicHeader } from '@/core/modules/clinic/components/clinic-header';
import ClinicLoginScreen from '@/core/modules/clinic/screens/clinic-login-screen';

export const metadata: Metadata = { title: 'Entrar · Clínica' };

export default function ClinicLoginPage() {
  return (
    <main>
      <ClinicHeader />
      <ClinicLoginScreen />
    </main>
  );
}
