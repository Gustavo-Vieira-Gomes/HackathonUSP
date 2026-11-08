import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closedPortUrl,
  startFakeApi,
} from '@/core/shared/services/fake-api.test-helper';
import {
  getSimulatedWhatsappMessages,
  groupByPhone,
} from '../services/whatsapp-demo.server.service';

const message = (id: string, phone: string, sentAt: string) => ({
  id,
  phone,
  kind: 'alerta' as const,
  body: `mensagem ${id}`,
  sentAt,
});

test('busca as mensagens com o token do operador e valida o contrato', async () => {
  const messages = [
    message('m1', '+5511999990000', '2026-11-08T05:00:00.000Z'),
  ];
  const api = await startFakeApi(() => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  }));
  try {
    const result = await getSimulatedWhatsappMessages({
      baseUrl: api.url,
      token: 'segredo-do-operador',
    });
    assert.deepEqual(result, { status: 'ok', messages });
    assert.equal(api.requests[0]?.url, '/api/demo/whatsapp/messages');
    assert.equal(
      api.requests[0]?.headers['x-demo-clock-token'],
      'segredo-do-operador',
    );
  } finally {
    await api.close();
  }
});

test('sem token no Next não chama a API e diz que a demo está desligada', async () => {
  const api = await startFakeApi(() => ({
    status: 200,
    body: '{"messages":[]}',
  }));
  try {
    const result = await getSimulatedWhatsappMessages({
      baseUrl: api.url,
      token: '',
    });
    assert.deepEqual(result, { status: 'disabled' });
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test('404, 401/403, 500, corpo fora do contrato, timeout e porta fechada viram estados claros', async () => {
  const cases: [number | 'stuck' | 'invalid', string][] = [
    [404, 'disabled'],
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [500, 'error'],
    ['invalid', 'error'],
    ['stuck', 'error'],
  ];
  for (const [reply, expected] of cases) {
    const api = await startFakeApi(() =>
      reply === 'stuck'
        ? null
        : reply === 'invalid'
          ? { status: 200, body: JSON.stringify({ messages: [{ id: 1 }] }) }
          : { status: reply, body: '{}' },
    );
    try {
      const result = await getSimulatedWhatsappMessages({
        baseUrl: api.url,
        token: 't',
        timeoutMs: 200,
      });
      assert.equal(result.status, expected, String(reply));
    } finally {
      await api.close();
    }
  }
  const closed = await getSimulatedWhatsappMessages({
    baseUrl: await closedPortUrl(),
    token: 't',
  });
  assert.equal(closed.status, 'error');
});

test('groupByPhone: conversa mais recente primeiro, mensagens em ordem cronológica', () => {
  const grouped = groupByPhone([
    message('b2', '+55b', '2026-11-08T05:03:00.000Z'),
    message('a2', '+55a', '2026-11-08T05:02:00.000Z'),
    message('b1', '+55b', '2026-11-08T05:01:00.000Z'),
    message('a1', '+55a', '2026-11-08T05:00:00.000Z'),
  ]);
  assert.deepEqual(
    grouped.map((c) => [c.phone, c.messages.map((m) => m.id)]),
    [
      ['+55b', ['b1', 'b2']],
      ['+55a', ['a1', 'a2']],
    ],
  );
});
