import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/core/modules/patient-auth/components/auth-shell';
import { SignInForm } from '@/core/modules/patient-auth/components/sign-in-form';
import { getCurrentPatient } from '@/core/modules/patient-auth/services/patient-auth.server.service';

export const metadata: Metadata = { title: 'Entrar · Hackathon USP' };

export default async function SignInPage() {
  if ((await getCurrentPatient()).kind === 'authenticated') {
    redirect('/minha-conta');
  }
  return (
    <AuthShell title="Entrar">
      <SignInForm />
      <p className="auth-switch">
        Ainda não tem conta? <Link href="/cadastro">Criar conta</Link>
      </p>
    </AuthShell>
  );
}
