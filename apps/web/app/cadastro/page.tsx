import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/core/modules/patient-auth/components/auth-shell';
import { SignUpForm } from '@/core/modules/patient-auth/components/sign-up-form';
import { getCurrentPatient } from '@/core/modules/patient-auth/services/patient-auth.server.service';

export const metadata: Metadata = { title: 'Criar conta · Hackathon USP' };

export default async function SignUpPage() {
  if ((await getCurrentPatient()).kind === 'authenticated') {
    redirect('/minha-conta');
  }
  return (
    <AuthShell title="Criar conta">
      <SignUpForm />
      <p className="auth-switch">
        Já tem conta? <Link href="/entrar">Entrar</Link>
      </p>
    </AuthShell>
  );
}
