'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  allowedExams,
  subscriptionResultSchema,
  type SubscriptionListItem,
} from '@hackathon/contracts';

export function SubscriptionList({
  subscriptions,
  renewId,
}: {
  subscriptions: SubscriptionListItem[];
  renewId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function renew(id: string) {
    setPending(id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/patient/subscriptions/${encodeURIComponent(id)}/renew`,
        { method: 'POST', signal: AbortSignal.timeout(15_000) },
      );
      if (response.status === 401) {
        router.push('/paciente/login');
        return;
      }
      if (!response.ok) throw new Error();
      const result = subscriptionResultSchema.parse(await response.json());
      setMessage('Inscrição renovada por mais 30 dias.');
      if (result.matchedVacancyId)
        router.push(`/paciente/vagas/${result.matchedVacancyId}`);
      router.refresh();
    } catch {
      setError('Não foi possível renovar. Tente novamente em instantes.');
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="subscription-list">
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-alert">
          {error}
        </p>
      )}
      {subscriptions.length === 0 && (
        <p className="intro">
          Você ainda não tem inscrições. Escolha um exame para conhecer as
          clínicas na região.
        </p>
      )}
      {subscriptions.map((subscription) => (
        <article className="card" key={subscription.id}>
          {renewId === subscription.id && (
            <p className="form-success">
              Renove esta inscrição pelo botão abaixo.
            </p>
          )}
          <h2 className="form-title">
            {allowedExams.find(
              (exam) => exam.tussCode === subscription.tussCode,
            )?.name ?? `Exame ${subscription.tussCode}`}
          </h2>
          <p>
            {subscription.active ? 'Inscrição ativa' : 'Inscrição expirada'} ·
            até{' '}
            {new Date(subscription.expiresAt).toLocaleDateString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
            })}
          </p>
          {subscription.matchedVacancyId ? (
            <Link
              className="primary-link"
              href={`/paciente/vagas/${subscription.matchedVacancyId}`}
            >
              Ver vaga compatível
            </Link>
          ) : (
            <p>Nenhuma vaga agora.</p>
          )}
          <p>
            {subscription.clinicCount}{' '}
            {subscription.clinicCount === 1
              ? 'clínica oferece'
              : 'clínicas oferecem'}{' '}
            este exame na sua região.
          </p>
          <p>
            Até{' '}
            {(subscription.maxPriceCents / 100).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}{' '}
            · raio de {subscription.radiusMeters / 1000} km.
          </p>
          <div className="subscription-actions">
            <Link
              href={`/paciente/reservas/nova?tussCode=${subscription.tussCode}`}
            >
              Fazer uma reserva comum
            </Link>
            <button
              type="button"
              className="secondary-button"
              disabled={pending !== null}
              onClick={() => renew(subscription.id)}
            >
              {pending === subscription.id
                ? 'Renovando…'
                : 'Renovar por mais 30 dias'}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
