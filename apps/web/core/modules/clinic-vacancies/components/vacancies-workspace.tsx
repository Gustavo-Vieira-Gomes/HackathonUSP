'use client';

import {
  clinicVacanciesSchema,
  type ClinicVacancies,
  type Exam,
} from '@hackathon/contracts';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { vacancyErrorMessage, vacancyFormBody } from '../vacancy-form';

const STATES = [
  'publicada',
  'alertando',
  'reservada',
  'realizada',
  'expirada',
  'cancelada',
] as const;
const time = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    value / 100,
  );

export function VacanciesWorkspace({
  exams,
  initial,
}: {
  exams: Exam[];
  initial: ClinicVacancies;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
    null,
  );

  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/clinic/vacancies', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('unavailable');
      const parsed = clinicVacanciesSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('invalid response');
      setData(parsed.data);
      setReadError(false);
    } catch {
      setReadError(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void reload();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  async function mutate(path: string, body?: unknown) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const error: unknown = await response.json().catch(() => null);
        setNotice({
          error: true,
          text: vacancyErrorMessage(response.status, error),
        });
        return false;
      }
      setNotice({
        error: false,
        text: body
          ? 'Horário vazio publicado.'
          : 'Falta registrada. O sinal, se houver, foi retido.',
      });
      return true;
    } catch {
      setNotice({ error: true, text: vacancyErrorMessage(503, null) });
      return false;
    } finally {
      await reload();
      setBusy(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const body = vacancyFormBody(
        String(values.get('examId')),
        String(values.get('startsAt')),
        String(values.get('endsAt')),
      );
      if (await mutate('/api/clinic/vacancies', body)) form.reset();
    } catch {
      setNotice({ error: true, text: 'Confira o início e o fim do horário.' });
    }
  }

  return (
    <div className="clinic-form">
      {notice && (
        <p
          className={notice.error ? 'form-alert' : 'form-success'}
          role={notice.error ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}
      <section className="form-group" aria-labelledby="publish-title">
        <h2 id="publish-title">Publicar horário vazio</h2>
        {exams.length === 0 ? (
          <p className="empty">
            Cadastre um <Link href="/clinica/exames">exame</Link> antes de
            publicar.
          </p>
        ) : (
          <form onSubmit={publish} aria-busy={busy}>
            <fieldset disabled={busy} className="form-group">
              <legend>Horário disponível · São Paulo (UTC−3)</legend>
              <label htmlFor="vacancy-exam">Exame</label>
              <select id="vacancy-exam" name="examId" required defaultValue="">
                <option value="" disabled>
                  Selecione um exame
                </option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
              <label htmlFor="vacancy-start">Início</label>
              <input
                id="vacancy-start"
                name="startsAt"
                type="datetime-local"
                required
              />
              <label htmlFor="vacancy-end">Fim</label>
              <input
                id="vacancy-end"
                name="endsAt"
                type="datetime-local"
                required
              />
              <label htmlFor="vacancy-reason">Motivo</label>
              <input id="vacancy-reason" value="Horário vazio" readOnly />
              <button className="button" type="submit">
                {busy ? 'Aguarde…' : 'Publicar vaga'}
              </button>
            </fieldset>
          </form>
        )}
      </section>

      <section className="form-group" aria-labelledby="today-title">
        <h2 id="today-title">Reservas de hoje</h2>
        <p className="field-hint">
          Relógio da plataforma: {time(data.now)} · São Paulo. Atualiza a cada
          10 segundos.
        </p>
        <button
          className="link-button"
          type="button"
          disabled={busy}
          onClick={() => {
            void reload();
          }}
        >
          Atualizar
        </button>
        {readError && (
          <p role="alert" className="form-alert">
            Não foi possível atualizar. Os dados abaixo podem estar
            desatualizados; tente novamente.
          </p>
        )}
        {data.reservations.length === 0 ? (
          <p className="empty">Nenhuma reserva hoje.</p>
        ) : (
          <ul>
            {data.reservations.map((reservation) => (
              <li key={reservation.id}>
                <strong>{reservation.examName}</strong> ·{' '}
                {time(reservation.startsAt)} ·{' '}
                {reservation.state === 'no_show'
                  ? 'Não compareceu'
                  : reservation.state}
                <button
                  className="link-button"
                  type="button"
                  disabled={busy || readError || !reservation.canDeclareNoShow}
                  onClick={() => {
                    void mutate(
                      `/api/clinic/reservations/${reservation.id}/no-show`,
                    );
                  }}
                >
                  Não compareceu
                  <span className="sr-only">
                    {' '}
                    · {reservation.examName}, {time(reservation.startsAt)}
                  </span>
                </button>
                {reservation.state === 'confirmada' &&
                  !reservation.canDeclareNoShow && (
                    <span className="field-hint">
                      {' '}
                      Disponível após a tolerância de atraso do exame.
                    </span>
                  )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="form-group" aria-labelledby="vacancy-list-title">
        <h2 id="vacancy-list-title">Vagas por estado</h2>
        {data.vacancies.length === 0 && (
          <p className="empty">Nenhuma vaga publicada.</p>
        )}
        {STATES.map((state) => {
          const vacancies = data.vacancies.filter(
            (vacancy) => vacancy.state === state,
          );
          if (!vacancies.length) return null;
          return (
            <section key={state} aria-label={`Vagas: ${state}`}>
              <h3>{state}</h3>
              <ul>
                {vacancies.map((vacancy) => (
                  <li key={vacancy.id}>
                    <strong>{vacancy.examName}</strong> ·{' '}
                    {time(vacancy.startsAt)} ·{' '}
                    {money(vacancy.currentPriceCents)}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </section>
    </div>
  );
}
