import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { after, before, test } from 'node:test';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';
import { MAX_ATTEMPTS } from './phone-verification.service';

/** Verificação do telefone por código (HACK-37), por HTTP contra o Postgres. */

let t: TestApp;
let off: TestApp;

before(async () => {
  t = await startTestApp({ WHATSAPP_MODE: 'simulated' });
  off = await startTestApp();
});

after(async () => {
  await t.close();
  await off.close();
});

/** Paciente logado com perfil e telefone próprios. */
async function patientSession(app: TestApp) {
  const account = await signUpWithCookie(app, 'paciente');
  const phone = `+55119${String(randomInt(0, 1e8)).padStart(8, '0')}`;
  const patient = await app.prisma.patient.update({
    where: { userId: account.id },
    data: { phone },
  });
  return { cookie: account.cookie, patientId: patient.id, phone };
}

const send = (app: TestApp, cookie: string) =>
  jsonRequest(app, 'POST', '/api/me/phone/verification', undefined, { cookie });
const confirm = (app: TestApp, cookie: string, body: unknown) =>
  jsonRequest(app, 'POST', '/api/me/phone/verification/confirm', body, {
    cookie,
  });

async function codeSentTo(phone: string): Promise<string> {
  const message = await t.prisma.simulatedWhatsappMessage.findFirstOrThrow({
    where: { phone, kind: 'codigo_verificacao' },
    orderBy: { createdAt: 'desc' },
  });
  const code = /\b(\d{6})\b/.exec(message.body)?.[1];
  assert.ok(code, message.body);
  return code;
}

const wrongCode = (code: string) =>
  String((Number(code) + 1) % 1_000_000).padStart(6, '0');

test('código chega pelo WhatsApp simulado e confirmar marca o telefone como verificado', async () => {
  const { cookie, patientId, phone } = await patientSession(t);
  const sent = await send(t, cookie);
  assert.equal(sent.status, 200);
  const { expiresAt } = (await sent.json()) as { expiresAt: string };
  const ttl = new Date(expiresAt).getTime() - Date.now();
  assert.ok(ttl > 9 * 60_000 && ttl <= 10 * 60_000, `ttl ${ttl}`);
  const code = await codeSentTo(phone);
  const stored = await t.prisma.phoneVerification.findUniqueOrThrow({
    where: { patientId },
  });
  assert.equal(stored.codeHash.includes(code), false);

  const confirmed = await confirm(t, cookie, { code });
  assert.equal(confirmed.status, 200);
  const patient = await t.prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
  });
  assert.ok(patient.phoneVerifiedAt);
  assert.equal(
    await t.prisma.phoneVerification.count({ where: { patientId } }),
    0,
  );
});

test('código errado devolve 422 com tentativas restantes; no limite, 429 e o código morre', async () => {
  const { cookie, patientId, phone } = await patientSession(t);
  await send(t, cookie);
  const code = await codeSentTo(phone);
  const first = await confirm(t, cookie, { code: wrongCode(code) });
  assert.equal(first.status, 422);
  assert.deepEqual(
    { ...((await first.json()) as object) },
    {
      code: 'INVALID_CODE',
      message: 'Código incorreto.',
      attemptsLeft: MAX_ATTEMPTS - 1,
    },
  );
  for (let i = 2; i < MAX_ATTEMPTS; i++) {
    assert.equal(
      (await confirm(t, cookie, { code: wrongCode(code) })).status,
      422,
    );
  }
  const last = await confirm(t, cookie, { code: wrongCode(code) });
  assert.equal(last.status, 429);
  const stored = await t.prisma.phoneVerification.findUniqueOrThrow({
    where: { patientId },
  });
  assert.equal(stored.attempts, MAX_ATTEMPTS);
  // Nem o código certo vale mais.
  const late = await confirm(t, cookie, { code });
  assert.equal(late.status, 429);
  assert.equal(
    ((await late.json()) as { code: string }).code,
    'TOO_MANY_ATTEMPTS',
  );
  const patient = await t.prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
  });
  assert.equal(patient.phoneVerifiedAt, null);
});

test('pedir outro código antes de 60 s responde 429 com o tempo de espera', async () => {
  const { cookie } = await patientSession(t);
  assert.equal((await send(t, cookie)).status, 200);
  const again = await send(t, cookie);
  assert.equal(again.status, 429);
  const body = (await again.json()) as {
    code: string;
    retryAfterSeconds: number;
  };
  assert.equal(body.code, 'RESEND_TOO_SOON');
  assert.ok(body.retryAfterSeconds > 0 && body.retryAfterSeconds <= 60);
});

test('código expirado responde 410', async () => {
  const { cookie, patientId, phone } = await patientSession(t);
  await send(t, cookie);
  const code = await codeSentTo(phone);
  await t.prisma.phoneVerification.update({
    where: { patientId },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });
  assert.equal((await confirm(t, cookie, { code })).status, 410);
});

test('telefone trocado depois do envio invalida o código', async () => {
  const { cookie, patientId, phone } = await patientSession(t);
  await send(t, cookie);
  const code = await codeSentTo(phone);
  await t.prisma.patient.update({
    where: { id: patientId },
    data: { phone: '+5511900000000' },
  });
  assert.equal((await confirm(t, cookie, { code })).status, 410);
});

test('corpo inválido 400; sem sessão 401; clínica 403', async () => {
  const { cookie } = await patientSession(t);
  for (const body of [
    { code: '123' },
    { code: '123456', phone: '+5511' },
    {},
  ]) {
    assert.equal(
      (await confirm(t, cookie, body)).status,
      400,
      JSON.stringify(body),
    );
  }
  assert.equal(
    (await jsonRequest(t, 'POST', '/api/me/phone/verification')).status,
    401,
  );
  const clinic = await signUpWithCookie(t, 'clinica');
  assert.equal((await send(t, clinic.cookie)).status, 403);
});

test('WhatsApp desligado: 503 e nenhum código gravado', async () => {
  const { cookie, patientId } = await patientSession(off);
  const response = await send(off, cookie);
  assert.equal(response.status, 503);
  assert.equal(
    ((await response.json()) as { code: string }).code,
    'WHATSAPP_UNAVAILABLE',
  );
  assert.equal(
    await off.prisma.phoneVerification.count({ where: { patientId } }),
    0,
  );
});

/** Código de erro de cada resposta (`ok` para 200). */
async function outcomeCodes(responses: Response[]): Promise<string[]> {
  return Promise.all(
    responses.map(async (r) =>
      r.status === 200 ? 'ok' : ((await r.json()) as { code: string }).code,
    ),
  );
}

test('HACK-49: 20 palpites errados simultâneos → 4 INVALID_CODE e 16 TOO_MANY_ATTEMPTS', async () => {
  const { cookie, patientId, phone } = await patientSession(t);
  await send(t, cookie);
  const code = await codeSentTo(phone);
  const guesses = Array.from({ length: 20 }, (_, i) =>
    String((Number(code) + 1 + i) % 1_000_000).padStart(6, '0'),
  );
  const codes = await outcomeCodes(
    await Promise.all(
      guesses.map((guess) => confirm(t, cookie, { code: guess })),
    ),
  );
  assert.equal(
    codes.filter((c) => c === 'INVALID_CODE').length,
    MAX_ATTEMPTS - 1,
  );
  assert.equal(
    codes.filter((c) => c === 'TOO_MANY_ATTEMPTS').length,
    20 - (MAX_ATTEMPTS - 1),
  );
  const stored = await t.prisma.phoneVerification.findUniqueOrThrow({
    where: { patientId },
  });
  assert.equal(stored.attempts, MAX_ATTEMPTS);
});

test('HACK-49: código certo no meio de 20 simultâneos só vale se estiver entre os 5 avaliados', async () => {
  const { cookie, patientId, phone } = await patientSession(t);
  await send(t, cookie);
  const code = await codeSentTo(phone);
  const guesses = Array.from({ length: 20 }, (_, i) =>
    i === 12
      ? code
      : String((Number(code) + 1 + i) % 1_000_000).padStart(6, '0'),
  );
  const codes = await outcomeCodes(
    await Promise.all(
      guesses.map((guess) => confirm(t, cookie, { code: guess })),
    ),
  );
  // Comparados: até 5. Os errados entre eles dão INVALID_CODE (ou 429 se for o 5º);
  // o acerto só passa se ganhou uma das 5 vagas.
  const invalid = codes.filter((c) => c === 'INVALID_CODE').length;
  const accepted = codes.filter((c) => c === 'ok').length;
  assert.ok(
    invalid + accepted <= MAX_ATTEMPTS,
    `comparados: ${invalid + accepted}`,
  );
  assert.ok(accepted <= 1);
  const patient = await t.prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
  });
  assert.equal(Boolean(patient.phoneVerifiedAt), codes[12] === 'ok');
});

test('dois pedidos de código simultâneos geram um código só', async () => {
  const { cookie, phone } = await patientSession(t);
  const statuses = (await Promise.all([send(t, cookie), send(t, cookie)])).map(
    (r) => r.status,
  );
  assert.deepEqual([...statuses].sort(), [200, 429]);
  assert.equal(
    await t.prisma.simulatedWhatsappMessage.count({
      where: { phone, kind: 'codigo_verificacao' },
    }),
    1,
  );
});
