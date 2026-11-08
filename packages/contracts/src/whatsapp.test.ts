import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  phoneVerificationConfirmBodySchema,
  simulatedWhatsappMessagesResponseSchema,
} from './whatsapp';

test('código de verificação aceita só 6 dígitos e nenhum campo extra', () => {
  assert.equal(
    phoneVerificationConfirmBodySchema.safeParse({ code: '012345' }).success,
    true,
  );
  for (const body of [
    { code: '12345' },
    { code: '1234567' },
    { code: '12a456' },
    { code: 123456 },
    { code: '123456', phone: '+55' },
  ]) {
    assert.equal(
      phoneVerificationConfirmBodySchema.safeParse(body).success,
      false,
      JSON.stringify(body),
    );
  }
});

test('lista de mensagens simuladas valida tipo e data', () => {
  const ok = {
    messages: [
      {
        id: 'm1',
        phone: '+5511999990000',
        kind: 'alerta',
        body: 'oi',
        sentAt: '2026-11-08T05:00:00.000Z',
      },
    ],
  };
  assert.equal(
    simulatedWhatsappMessagesResponseSchema.safeParse(ok).success,
    true,
  );
  const bad = { messages: [{ ...ok.messages[0], kind: 'outro' }] };
  assert.equal(
    simulatedWhatsappMessagesResponseSchema.safeParse(bad).success,
    false,
  );
});
