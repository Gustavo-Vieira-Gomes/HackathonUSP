import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderAlert } from './render-alert';

const message = {
  clinicName: 'Clínica Teste',
  examName: 'RM de joelho',
  startsAt: new Date('2026-11-14T13:00:00Z'), // sábado 10h em São Paulo
  priceCents: 57600,
  distanceMeters: 3250,
  preparation: 'jejum de 4 h',
  vacancyUrl: 'https://app.example/vagas/v1',
};

test('texto do alerta tem clínica, exame, horário local, preço, distância, preparo e link', () => {
  const alert = renderAlert(message);
  assert.equal(alert.title, 'Vaga de RM de joelho');
  assert.equal(alert.url, message.vacancyUrl);
  for (const piece of [
    'RM de joelho em Clínica Teste',
    '14/11',
    '10:00',
    'R$ 576,00',
    '3,3 km',
    'Preparo: jejum de 4 h',
    message.vacancyUrl,
  ]) {
    assert.ok(
      alert.body.includes(piece),
      `falta "${piece}" em:\n${alert.body}`,
    );
  }
});

test('sem preparo, a linha de preparo não aparece', () => {
  assert.equal(
    renderAlert({ ...message, preparation: null }).body.includes('Preparo'),
    false,
  );
});
