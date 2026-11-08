'use client';

import { useEffect, useState } from 'react';
import {
  pushKeyResponseSchema,
  pushRegistrationResponseSchema,
} from '@hackathon/contracts';
import { canOfferPush, vapidKeyBytes } from '../push-permission';

/** HACK-24 deve montar após a inscrição persistida, com subscribed=true. */
export function PushPermission({ subscribed }: { subscribed: boolean }) {
  const [available, setAvailable] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!subscribed) return;
    const supported =
      window.isSecureContext &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    if (!supported) return;
    if (!canOfferPush(subscribed, supported, Notification.permission)) {
      return;
    }
    const controller = new AbortController();
    void fetch('/api/patient/push/key', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const parsed = pushKeyResponseSchema.safeParse(await response.json());
        if (parsed.success && parsed.data.publicKey) {
          setPublicKey(parsed.data.publicKey);
          setAvailable(true);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [subscribed]);

  async function enable() {
    if (!publicKey || busy) return;
    setBusy(true);
    try {
      // Gesto explícito após inscrição: nunca pedir permissão ao montar a página.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setAvailable(false);
        setMessage('Sem push. Os demais canais continuam disponíveis.');
        return;
      }
      await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes(publicKey),
        }));
      const response = await fetch('/api/patient/push/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('save');
      const saved = pushRegistrationResponseSchema.parse(await response.json());
      if (!saved.registered) throw new Error('save');
      setAvailable(false);
      setMessage('Notificações push ativadas neste navegador.');
    } catch {
      setMessage(
        'Não foi possível ativar o push. Tente novamente; os demais canais continuam disponíveis.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!subscribed) return null;
  return (
    <section aria-label="Notificações do navegador">
      {available && (
        <button type="button" disabled={busy} onClick={() => void enable()}>
          {busy ? 'Ativando…' : 'Ativar notificações de vagas'}
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
