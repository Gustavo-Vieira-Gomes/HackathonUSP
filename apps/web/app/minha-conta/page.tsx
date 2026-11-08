import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOutAction } from '@/core/modules/patient-auth/actions/patient-auth.actions';
import { AuthShell } from '@/core/modules/patient-auth/components/auth-shell';
import { getCurrentPatient } from '@/core/modules/patient-auth/services/patient-auth.server.service';
import { formatPhone } from '@/core/modules/patient-auth/utils/format-phone';

export const metadata: Metadata = { title: 'Minha conta · Hackathon USP' };

export default async function AccountPage() {
  const current = await getCurrentPatient();
  if (current.kind === 'anonymous') redirect('/entrar');
  if (current.kind === 'unavailable') {
    return (
      <AuthShell title="Minha conta">
        <div className="form-alert" role="alert">
          <p>
            Não foi possível carregar sua conta agora. Tente novamente em
            instantes.
          </p>
        </div>
      </AuthShell>
    );
  }

  const { patient } = current;
  return (
    <AuthShell title={`Olá, ${patient.name}`}>
      <dl className="account-details">
        <div>
          <dt>Nome</dt>
          <dd>{patient.name}</dd>
        </div>
        <div>
          <dt>E-mail</dt>
          <dd>{patient.email}</dd>
        </div>
        <div>
          <dt>Telefone</dt>
          <dd>{formatPhone(patient.phone)}</dd>
        </div>
      </dl>
      <form action={signOutAction}>
        <button type="submit" className="button button-secondary">
          Sair
        </button>
      </form>
    </AuthShell>
  );
}
