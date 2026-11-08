import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getPatientReservation } from '@/core/modules/patient/patient-record.service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Minha reserva' };

export default async function PatientReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPatientReservation(id, (await cookies()).toString());
  if (result.kind === 'not-found') notFound();
  if (result.kind === 'unauthenticated') redirect('/paciente/login');
  if (result.kind !== 'ok')
    return (
      <section className="patient-page">
        <h1 className="clinic-title">Minha reserva</h1>
        <p role="alert" className="form-alert">
          Não foi possível carregar esta reserva. Tente novamente em instantes.
        </p>
      </section>
    );
  const { record } = result;
  return (
    <section className="patient-page">
      <p className="eyebrow">Minha reserva</p>
      <h1 className="clinic-title">{record.slot.exam.name}</h1>
      <dl className="patient-record">
        <dt>Horário do exame</dt>
        <dd>
          {new Date(record.slot.startsAt).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
          })}{' '}
          (São Paulo)
        </dd>
        <dt>Situação</dt>
        <dd>{record.state.replaceAll('_', ' ')}</dd>
        <dt>Preço</dt>
        <dd>
          {(record.chargedPriceCents / 100).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })}
        </dd>
        <dt>Sinal</dt>
        <dd>
          {(record.depositCents / 100).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })}
        </dd>
      </dl>
    </section>
  );
}
