import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderAlert } from '../render-alert';
import {
  calendarDisconnectedEmail,
  escapeHtml,
  reservationCanceledByClinicEmail,
  reservationConfirmedEmail,
  subscriptionRenewalEmail,
  vacancyAlertEmail,
} from './email-templates';

const startsAt = new Date('2026-11-14T13:00:00Z'); // sábado 10h em São Paulo
const reservation = {
  patientName: 'Ana',
  examName: 'RM de joelho',
  clinicName: 'Clínica <Teste> & Cia',
  clinicAddress: 'Av. Prof. Luciano Gualberto, 380',
  startsAt,
  depositCents: 11520,
  reservationUrl: 'https://app.example/reservas/r1',
};

test('escapeHtml neutraliza tags e aspas vindas de cadastro', () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script> & 'y'`),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
  );
});

test('alerta de vaga: mesmo texto do renderAlert, link da vaga em botão e no texto', () => {
  const alert = renderAlert({
    clinicName: 'Clínica Teste',
    examName: 'RM de joelho',
    startsAt,
    priceCents: 57600,
    distanceMeters: 3200,
    preparation: null,
    vacancyUrl: 'https://app.example/vagas/v1?x=1&y=2',
  });
  const email = vacancyAlertEmail(alert);
  assert.equal(email.subject, 'Vaga de RM de joelho');
  assert.ok(email.text.includes('RM de joelho em Clínica Teste'));
  assert.ok(
    email.text.includes('Ver a vaga: https://app.example/vagas/v1?x=1&y=2'),
  );
  assert.ok(
    email.html.includes('href="https://app.example/vagas/v1?x=1&amp;y=2"'),
  );
  assert.ok(email.text.includes('R$ 576,00'));
});

test('dado de cadastro com HTML não vira marcação no e-mail', () => {
  const email = reservationConfirmedEmail(reservation);
  assert.equal(email.html.includes('<Teste>'), false);
  assert.ok(email.html.includes('Clínica &lt;Teste&gt; &amp; Cia'));
  assert.ok(email.text.includes('Clínica <Teste> & Cia'));
});

test('confirmação de reserva traz exame, clínica, horário local, endereço e sinal', () => {
  const { subject, text, html } = reservationConfirmedEmail(reservation);
  assert.equal(subject, 'Reserva confirmada: RM de joelho');
  for (const piece of [
    'Ana',
    '14/11',
    '10:00',
    'Luciano Gualberto',
    'R$ 115,20',
  ]) {
    assert.ok(text.includes(piece), `falta "${piece}"`);
  }
  assert.ok(html.includes('href="https://app.example/reservas/r1"'));
});

test('cancelamento pela clínica informa motivo e devolução integral do sinal', () => {
  const { subject, text } = reservationCanceledByClinicEmail({
    ...reservation,
    reason: 'equipamento em manutenção',
  });
  assert.ok(subject.includes('cancelou'));
  assert.ok(text.includes('Motivo: equipamento em manutenção.'));
  assert.ok(text.includes('devolvido integralmente'));
});

test('renovação de inscrição e agenda desconectada têm o link de ação', () => {
  const renewal = subscriptionRenewalEmail({
    patientName: 'Ana',
    examName: 'RM de joelho',
    expiresAt: startsAt,
    renewUrl: 'https://app.example/inscricoes/s1/renovar',
  });
  assert.ok(
    renewal.text.includes(
      'Renovar inscrição: https://app.example/inscricoes/s1/renovar',
    ),
  );
  const calendar = calendarDisconnectedEmail({
    clinicName: 'Clínica Teste',
    reconnectUrl: 'https://app.example/clinica/agenda',
  });
  assert.equal(calendar.subject, 'Sua agenda foi desconectada');
  assert.ok(
    calendar.text.includes(
      'Reconectar agenda: https://app.example/clinica/agenda',
    ),
  );
});
