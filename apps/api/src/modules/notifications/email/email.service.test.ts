import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { Logger } from '@nestjs/common';
import { type AppEnv, loadEnv } from '../../../config/env';
import { EmailDeliveryError, EmailService } from './email.service';
import { startFakeResend } from './fake-resend.test-helper';

const API_KEY = 're_test_chave_que_nao_pode_vazar';
const TO = 'paciente-que-nao-pode-vazar@exemplo.com';
const message = { to: TO, subject: 'Assunto', html: '<p>oi</p>', text: 'oi' };

let fake: Awaited<ReturnType<typeof startFakeResend>>;
let service: EmailService;
let warnings: string[];

function envFor(url: string, overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    ...loadEnv(),
    RESEND_API_KEY: API_KEY,
    RESEND_API_URL: url,
    EMAIL_FROM: 'Vagas <alertas@exemplo.com>',
    ...overrides,
  };
}

before(async () => {
  fake = await startFakeResend();
  service = new EmailService(envFor(fake.url));
});

beforeEach(() => {
  fake.reset();
  warnings = [];
  mock.method(
    Logger.prototype,
    'warn',
    (text: string) => void warnings.push(text),
  );
});

after(async () => {
  mock.restoreAll();
  await fake.close();
});

test('envia com Bearer, Idempotency-Key, remetente e destinatário', async () => {
  const result = await service.send(message, { idempotencyKey: 'alert-1' });
  assert.equal(result.id, 'email-1');
  assert.equal(fake.calls.length, 1);
  const [call] = fake.calls;
  assert.ok(call);
  assert.equal(call.headers.authorization, `Bearer ${API_KEY}`);
  assert.equal(call.headers['idempotency-key'], 'alert-1');
  assert.deepEqual(call.body, {
    from: 'Vagas <alertas@exemplo.com>',
    to: [TO],
    subject: 'Assunto',
    html: '<p>oi</p>',
    text: 'oi',
  });
});

test('5xx e depois 200: duas tentativas com a mesma chave', async () => {
  fake.reply({ status: 503 }, { status: 200, body: { id: 'ok' } });
  const result = await service.send(message, { idempotencyKey: 'alert-2' });
  assert.equal(result.id, 'ok');
  assert.deepEqual(
    fake.calls.map((c) => c.headers['idempotency-key']),
    ['alert-2', 'alert-2'],
  );
});

test('429 também é repetido', async () => {
  fake.reply({ status: 429 }, { status: 200, body: { id: 'ok' } });
  await service.send(message, { idempotencyKey: 'alert-3' });
  assert.equal(fake.calls.length, 2);
});

test('5xx duas vezes: para em 2 tentativas e lança', async () => {
  fake.reply({ status: 500 }, { status: 500 });
  await assert.rejects(
    service.send(message, { idempotencyKey: 'alert-4' }),
    (error: unknown) =>
      error instanceof EmailDeliveryError && /500/.test(error.message),
  );
  assert.equal(fake.calls.length, 2);
});

test('4xx de validação não é repetido', async () => {
  fake.reply({ status: 422, body: { message: `to inválido: ${TO}` } });
  await assert.rejects(service.send(message, { idempotencyKey: 'alert-5' }), {
    name: 'EmailDeliveryError',
    retryable: false,
  });
  assert.equal(fake.calls.length, 1);
});

test('resposta 200 sem id é falha, sem repetir', async () => {
  fake.reply({ status: 200, body: {} });
  await assert.rejects(service.send(message, { idempotencyKey: 'alert-6' }), {
    name: 'EmailDeliveryError',
  });
  assert.equal(fake.calls.length, 1);
});

test('sinal externo abortado (tempo do canal) interrompe sem segunda tentativa', async () => {
  fake.reply('hang', { status: 200, body: { id: 'tarde-demais' } });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 200);
  const started = Date.now();
  await assert.rejects(
    service.send(message, {
      idempotencyKey: 'alert-7',
      signal: controller.signal,
    }),
    { name: 'EmailDeliveryError' },
  );
  assert.ok(Date.now() - started < 2_000);
  assert.equal(fake.calls.length, 1);
});

test('sem chave configurada: lança sem chamar o Resend', async () => {
  const unconfigured = new EmailService(
    envFor(fake.url, { RESEND_API_KEY: undefined }),
  );
  assert.equal(unconfigured.isConfigured(), false);
  await assert.rejects(unconfigured.send(message, { idempotencyKey: 'x' }), {
    name: 'EmailDeliveryError',
    retryable: false,
  });
  assert.equal(fake.calls.length, 0);
});

test('log de falha não leva chave, destinatário nem corpo do Resend', async () => {
  fake.reply({ status: 500 }, { status: 422, body: { message: TO } });
  await assert.rejects(service.send(message, { idempotencyKey: 'alert-8' }));
  assert.equal(warnings.length, 2);
  for (const line of warnings) {
    assert.equal(line.includes(API_KEY), false, line);
    assert.equal(line.includes(TO), false, line);
  }
});
