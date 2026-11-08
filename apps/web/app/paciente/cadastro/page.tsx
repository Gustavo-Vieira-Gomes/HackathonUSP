import type { Metadata } from 'next';
import { PatientAuthForm } from '@/core/modules/patient/components/patient-auth-form';

export const metadata: Metadata = { title: 'Cadastro de paciente' };

export default function PatientSignUpPage() {
  return <PatientAuthForm mode="cadastro" />;
}
