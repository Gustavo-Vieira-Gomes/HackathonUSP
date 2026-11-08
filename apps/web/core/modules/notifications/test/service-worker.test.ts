import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

test('worker mostra texto comum e clique só abre vaga na mesma origem', async () => {
  const handlers = new Map<string, (event: unknown) => void>();
  const shown: unknown[] = [];
  const opened: string[] = [];
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    URL,
    self: {
      addEventListener: (name: string, callback: (event: unknown) => void) =>
        handlers.set(name, callback),
      location: { origin: 'http://localhost:3000' },
      registration: {
        showNotification: async (...args: unknown[]) => {
          shown.push(args);
        },
      },
      clients: {
        openWindow: async (url: string) => {
          opened.push(url);
        },
      },
    },
  });
  const pending: Promise<unknown>[] = [];
  const waitUntil = (promise: Promise<unknown>) => pending.push(promise);
  handlers.get('push')?.({
    data: {
      json: () => ({
        title: 'Vaga',
        body: 'Clínica, exame, horário, preço, distância e preparo',
        url: '/paciente/vagas/v1',
        alertId: 'a1',
      }),
    },
    waitUntil,
  });
  assert.equal(shown.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(shown[0])), [
    'Vaga',
    {
      body: 'Clínica, exame, horário, preço, distância e preparo',
      icon: '/icons/icon-192.png',
      data: { url: '/paciente/vagas/v1' },
    },
  ]);
  handlers.get('push')?.({ data: { json: () => null }, waitUntil });
  assert.equal(shown.length, 1);
  for (const url of [
    '/paciente/vagas/v1',
    'https://evil.test/paciente/vagas/v1',
    '/clinica',
    '//evil.test/paciente/vagas/v1',
  ]) {
    handlers.get('notificationclick')?.({
      notification: { data: { url }, close() {} },
      waitUntil,
    });
  }
  await Promise.all(pending);
  assert.deepEqual(opened, ['http://localhost:3000/paciente/vagas/v1']);
});
