import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getPatientSubscription } from '@/core/modules/patient/patient-record.service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Minha inscrição' };

export default async function PatientSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPatientSubscription(id, (await cookies()).toString());
  if (result.kind === 'not-found') notFound();
  if (result.kind === 'unauthenticated') redirect('/paciente/login');
  if (result.kind !== 'ok')
    return (
      <section className="patient-page">
        <h1 className="clinic-title">Minha inscrição</h1>
        <p role="alert" className="form-alert">
          Não foi possível carregar esta inscrição. Tente novamente em
          instantes.
        </p>
      </section>
    );
  const { record } = result;
  return (
    <section className="patient-page">
      <p className="eyebrow">Minha inscrição</p>
      <h1 className="clinic-title">Exame {record.tussCode}</h1>
      <dl className="patient-record">
        <dt>Preço máximo</dt>
        <dd>
          {(record.maxPriceCents / 100).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })}
        </dd>
        <dt>Raio de busca</dt>
        <dd>{record.radiusMeters / 1000} km</dd>
        <dt>Validade</dt>
        <dd>
          {new Date(record.expiresAt).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
          })}{' '}
          (São Paulo)
        </dd>
        <dt>Disponível hoje</dt>
        <dd>{record.canGoToday ? 'Sim' : 'Não'}</dd>
      </dl>
    </section>
  );
}
