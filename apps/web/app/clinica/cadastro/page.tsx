import type { Metadata } from 'next';
import { ClinicHeader } from '@/core/modules/clinic/components/clinic-header';
import ClinicSignUpScreen from '@/core/modules/clinic/screens/clinic-sign-up-screen';

export const metadata: Metadata = { title: 'Cadastro de clínica' };

export default function ClinicSignUpPage() {
  return (
    <main>
      <ClinicHeader />
      <ClinicSignUpScreen />
    </main>
  );
}
