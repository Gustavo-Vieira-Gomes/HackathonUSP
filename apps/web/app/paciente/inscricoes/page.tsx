import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPatientSubscriptions } from '@/core/modules/patient/subscriptions.service';
import { SubscriptionList } from '@/core/modules/patient/components/subscription-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minha lista de encaixe' };

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ renovar?: string; subscribed?: string }>;
}) {
  const query = await searchParams;
  const result = await getPatientSubscriptions((await cookies()).toString());
  if (result.kind === 'unauthenticated') redirect('/paciente/login');
  return (
    <section className="patient-page">
      <p className="eyebrow">Lista de encaixe</p>
      <h1 className="clinic-title">Minhas inscrições</h1>
      <p className="intro">Escolha quando e onde você pode fazer seu exame.</p>
      <Link className="primary-link" href="/paciente/inscricoes/nova">
        Inscrever para um exame
      </Link>
      {query.subscribed === '1' && (
        <p role="status" className="form-success">
          Inscrição concluída. Vamos procurar vagas nas suas janelas.
        </p>
      )}
      {result.kind === 'ok' ? (
        <SubscriptionList
          subscriptions={result.subscriptions}
          renewId={query.renovar}
        />
      ) : (
        <p role="alert" className="form-alert">
          Não foi possível carregar suas inscrições. Tente novamente em
          instantes.
        </p>
      )}
    </section>
  );
}
