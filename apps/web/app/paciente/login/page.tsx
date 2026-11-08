import type { Metadata } from 'next';
import { PatientAuthForm } from '@/core/modules/patient/components/patient-auth-form';

export const metadata: Metadata = { title: 'Entrar · Paciente' };

export default function PatientLoginPage() {
  return <PatientAuthForm mode="login" />;
}
