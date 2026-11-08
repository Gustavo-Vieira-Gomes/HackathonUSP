'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  allowedExams,
  subscriptionCreateBodySchema,
  subscriptionResultSchema,
} from '@hackathon/contracts';

const weekdays = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];
const steps = ['Exame', 'Região', 'Preço máximo', 'Disponibilidade'];
const minutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

export function SubscriptionForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [exam, setExam] = useState(allowedExams[0].tussCode);
  const [address, setAddress] = useState('');
  const [position, setPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [radius, setRadius] = useState('10');
  const [price, setPrice] = useState('');
  const [windows, setWindows] = useState([
    { weekday: 1, start: '18:00', end: '21:00' },
  ]);
  const [today, setToday] = useState(false);
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  function locate(currentOnly = false) {
    setError('');
    if (!navigator.geolocation) {
      setError('Seu navegador não oferece localização. Informe um endereço.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        if (!currentOnly) setPosition(location);
        setCurrentPosition(location);
        setLocating(false);
      },
      () => {
        setError(
          'Não foi possível obter sua localização. Permita o acesso ou informe um endereço. Para ir hoje, precisamos da localização atual.',
        );
        setLocating(false);
      },
      { timeout: 10_000, maximumAge: 0 },
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (step === 1 && !position && !address.trim()) {
      setError('Informe um endereço ou use sua localização.');
      return;
    }
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    if (today && !currentPosition) {
      setError('Use sua localização atual para marcar “posso ir hoje”.');
      return;
    }
    const body = subscriptionCreateBodySchema.safeParse({
      tussCode: exam,
      ...(position ?? { address }),
      radiusMeters: Math.round(Number(radius) * 1000),
      maxPriceCents: Math.round(Number(price) * 100),
      windows: windows.map((window) => ({
        weekday: window.weekday,
        startMinute: minutes(window.start),
        endMinute: minutes(window.end),
      })),
      canGoToday: today,
      ...(today && currentPosition
        ? {
            currentLatitude: currentPosition.latitude,
            currentLongitude: currentPosition.longitude,
          }
        : {}),
    });
    if (!body.success) {
      setError(
        'Revise os dados. Escolha pelo menos uma janela válida, com início antes do fim.',
      );
      return;
    }
    setPending(true);
    try {
      const response = await fetch('/api/patient/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body.data),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 401) {
        router.push('/paciente/login');
        return;
      }
      if (!response.ok) {
        setError(
          response.status === 422
            ? 'Não foi possível localizar esse endereço ou validar os dados. Revise sua inscrição.'
            : 'Não foi possível concluir sua inscrição. Tente novamente.',
        );
        return;
      }
      const result = subscriptionResultSchema.parse(await response.json());
      // TODO HACK-35: montar PushPermission({ subscribed: true }) aqui após inscrição, quando disponível em main.
      router.push(
        result.matchedVacancyId
          ? `/paciente/vagas/${result.matchedVacancyId}`
          : '/paciente/inscricoes?subscribed=1',
      );
      router.refresh();
    } catch {
      setError('O serviço está indisponível. Tente novamente em instantes.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="patient-page">
      <Link href="/paciente/inscricoes">Minhas inscrições</Link>
      <p className="eyebrow subscription-progress" role="status">
        Passo {step + 1} de {steps.length} · {steps[step]}
      </p>
      <h1 className="clinic-title">Entrar na lista de encaixe</h1>
      <p className="field-hint">
        Sua inscrição vale por 30 dias e pode ser renovada.
      </p>
      <form className="clinic-form" onSubmit={submit} aria-busy={pending}>
        {error && (
          <p role="alert" className="form-alert">
            {error}
          </p>
        )}
        <fieldset className="patient-fields" disabled={pending}>
          <legend className="sr-only">{steps[step]}</legend>
          <div hidden={step !== 0} className="patient-fields">
            <div className="field">
              <label htmlFor="subscription-exam">
                Qual exame você precisa?
              </label>
              <select
                id="subscription-exam"
                value={exam}
                onChange={(event) => setExam(event.target.value)}
              >
                {allowedExams.map((item) => (
                  <option key={item.tussCode} value={item.tussCode}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="field-hint" data-photo-shortcut>
              Atalho pela foto do pedido: em breve. Você pode continuar
              escolhendo na lista.
            </p>
          </div>
          <div hidden={step !== 1} className="patient-fields">
            <div className="field">
              <label htmlFor="subscription-address">Endereço ou CEP</label>
              <input
                id="subscription-address"
                autoComplete="street-address"
                maxLength={300}
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setPosition(null);
                }}
              />
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={locating}
              onClick={() => locate()}
            >
              {locating
                ? 'Obtendo localização…'
                : 'Usar minha localização atual'}
            </button>
            {position && (
              <p role="status" className="form-success">
                Localização atual obtida.
              </p>
            )}
            <div className="field">
              <label htmlFor="subscription-radius">Raio de busca (km)</label>
              <input
                id="subscription-radius"
                type="number"
                min="1"
                max="200"
                step="1"
                required={step === 1}
                value={radius}
                onChange={(event) => setRadius(event.target.value)}
              />
            </div>
          </div>
          <div hidden={step !== 2} className="field">
            <label htmlFor="subscription-price">
              Quanto você pode pagar? (R$)
            </label>
            <input
              id="subscription-price"
              type="number"
              inputMode="decimal"
              min="0.01"
              max="100000"
              step="0.01"
              required={step === 2}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
          <div hidden={step !== 3} className="patient-fields">
            <p className="field-hint">
              Adicione dias e faixas de hora em que você pode fazer o exame.
              Horários de São Paulo.
            </p>
            {windows.map((window, index) => (
              <fieldset className="subscription-window" key={index}>
                <legend>Janela {index + 1}</legend>
                <div className="field">
                  <label htmlFor={`window-day-${index}`}>Dia da semana</label>
                  <select
                    id={`window-day-${index}`}
                    value={window.weekday}
                    onChange={(event) =>
                      setWindows(
                        windows.map((item, i) =>
                          i === index
                            ? { ...item, weekday: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  >
                    {weekdays.map((day, value) => (
                      <option key={day} value={value}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="subscription-times">
                  {(['start', 'end'] as const).map((field) => (
                    <div className="field" key={field}>
                      <label htmlFor={`window-${field}-${index}`}>
                        {field === 'start' ? 'Das' : 'Até'}
                      </label>
                      <input
                        id={`window-${field}-${index}`}
                        type="time"
                        required={step === 3}
                        value={window[field]}
                        onChange={(event) =>
                          setWindows(
                            windows.map((item, i) =>
                              i === index
                                ? { ...item, [field]: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                {windows.length > 1 && (
                  <button
                    className="link-button"
                    type="button"
                    onClick={() =>
                      setWindows(windows.filter((_, i) => i !== index))
                    }
                  >
                    Remover janela {index + 1}
                  </button>
                )}
              </fieldset>
            ))}
            <button
              className="secondary-button"
              type="button"
              disabled={windows.length >= 28}
              onClick={() =>
                setWindows([
                  ...windows,
                  { weekday: 1, start: '18:00', end: '21:00' },
                ])
              }
            >
              Adicionar janela
            </button>
            <label className="patient-consent-label">
              <input
                type="checkbox"
                checked={today}
                onChange={(event) => setToday(event.target.checked)}
              />
              Posso ir hoje
            </label>
            {today && (
              <>
                <p className="field-hint">
                  Precisamos da sua localização atual para procurar vagas para
                  hoje.
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={locating}
                  onClick={() => locate(true)}
                >
                  {locating
                    ? 'Obtendo localização…'
                    : 'Atualizar minha localização'}
                </button>
                {currentPosition && (
                  <p role="status">Localização atual obtida.</p>
                )}
              </>
            )}
          </div>
        </fieldset>
        <div className="subscription-actions">
          {step > 0 && (
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => {
                setStep(step - 1);
                setError('');
              }}
            >
              Voltar
            </button>
          )}
          <button
            type="submit"
            className="primary-button"
            disabled={pending || locating}
          >
            {pending
              ? 'Concluindo…'
              : step === 3
                ? 'Concluir inscrição'
                : 'Continuar'}
          </button>
        </div>
      </form>
    </section>
  );
}
