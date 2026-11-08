import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../app';
import type { AlertChannel, Clinic, Exam } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createSchemaFixtures, examData } from '../../testing/schema-fixtures';
import type {
  AlertContext,
  ChannelAdapter,
  NotificationChannel,
  NotificationMessage,
  NotificationRecipient,
  OutgoingNotification,
} from './notification.types';
import {
  CHANNEL_TIMEOUT_MS,
  NotificationsService,
  STALE_PENDING_MS,
} from './notifications.service';

/**
 * Serviço de notificação contra o Postgres (HACK-34, HACK-45): a unicidade
 * (vaga, inscrição, canal), o P2002 e o `updateMany` condicional são os reais. Os
 * adapters são falsos, porque os fornecedores entram nos cards 4.2 a 4.4.
 */

const message: NotificationMessage = {
  clinicName: 'Clínica Teste',
  examName: 'Ultrassonografia de abdome total',
  startsAt: new Date('2027-01-16T13:00:00Z'),
  priceCents: 30000,
  distanceMeters: 1200,
  preparation: 'jejum de 8 h',
  vacancyUrl: 'https://app.example/vagas/1',
};

let app: INestApplication;
let prisma: PrismaService;
let fixtures: ReturnType<typeof createSchemaFixtures>;
let clinic: Clinic;
let exam: Exam;

before(async () => {
  app = await createApp({ logger: false });
  prisma = app.get(PrismaService);
  fixtures = createSchemaFixtures(prisma);
  clinic = await fixtures.createClinic();
  exam = await prisma.exam.create({
    data: examData(clinic.id, { tussCode: '60000001' }),
  });
});

after(async () => {
  const ownClinic = { clinic: { userId: { in: fixtures.userIds } } };
  await prisma.alert.deleteMany({ where: { vacancy: { slot: ownClinic } } });
  await prisma.subscription.deleteMany({
    where: { patient: { userId: { in: fixtures.userIds } } },
  });
  await prisma.vacancy.deleteMany({ where: { slot: ownClinic } });
  await prisma.slot.deleteMany({ where: ownClinic });
  await prisma.exam.deleteMany({ where: ownClinic });
  await prisma.patient.deleteMany({
    where: { userId: { in: fixtures.userIds } },
  });
  await prisma.clinic.deleteMany({
    where: { userId: { in: fixtures.userIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: fixtures.userIds } } });
  await app.close();
});

let slotSeq = 0;

/** Paciente com as preferências pedidas, uma vaga nova e a inscrição dele. */
async function scenario(
  options: { channels?: AlertChannel[]; phoneVerified?: boolean } = {},
) {
  const patient = await fixtures.createPatient();
  await prisma.patient.update({
    where: { id: patient.id },
    data: {
      alertChannels: options.channels ?? ['push', 'email', 'whatsapp'],
      phoneVerifiedAt: options.phoneVerified === false ? null : new Date(),
    },
  });
  const startsAt = new Date(Date.UTC(2027, 0, 16, 13, ++slotSeq));
  const slot = await prisma.slot.create({
    data: {
      clinicId: clinic.id,
      examId: exam.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      origin: 'manual',
    },
  });
  const vacancy = await prisma.vacancy.create({
    data: { slotId: slot.id, origin: 'vazio', currentPriceCents: 25000 },
  });
  const subscription = await prisma.subscription.create({
    data: {
      patientId: patient.id,
      tussCode: exam.tussCode,
      maxPriceCents: 30000,
      latitude: clinic.latitude,
      longitude: clinic.longitude,
      radiusMeters: 5000,
      expiresAt: new Date('2027-12-31T00:00:00Z'),
    },
  });
  const context: AlertContext = {
    vacancyId: vacancy.id,
    subscriptionId: subscription.id,
    wave: 1,
  };
  return { patientId: patient.id, context };
}

type Sent = {
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  notification: OutgoingNotification;
};

function recording(
  channels: NotificationChannel[],
  behavior: Partial<Record<NotificationChannel, 'fail' | 'hang'>> = {},
) {
  const sent: Sent[] = [];
  const adapters: ChannelAdapter[] = channels.map((channel) => ({
    channel,
    send: async (recipient, notification) => {
      if (behavior[channel] === 'fail') throw new Error('fornecedor fora');
      if (behavior[channel] === 'hang') await new Promise(() => {});
      sent.push({ channel, recipient, notification });
    },
  }));
  return { sent, service: new NotificationsService(prisma, adapters) };
}

const ALL: NotificationChannel[] = ['push', 'email', 'whatsapp'];

async function alertsOf(context: AlertContext) {
  const rows = await prisma.alert.findMany({
    where: {
      vacancyId: context.vacancyId,
      subscriptionId: context.subscriptionId,
    },
  });
  return Object.fromEntries(rows.map((row) => [row.channel, row.result]));
}

const outcomeMap = (outcomes: { channel: string; result: string }[]) =>
  Object.fromEntries(outcomes.map((o) => [o.channel, o.result]));

describe('critérios do card (HACK-34)', () => {
  test('WhatsApp fora: push e e-mail enviados, Alert registra a falha do WhatsApp', async () => {
    const { patientId, context } = await scenario();
    const { service } = recording(ALL, { whatsapp: 'fail' });
    const outcome = await service.enviar(patientId, message, context);
    const expected = { push: 'enviado', email: 'enviado', whatsapp: 'falhou' };
    assert.deepEqual(outcomeMap(outcome), expected);
    assert.deepEqual(await alertsOf(context), expected);
  });

  test('um paciente, uma vaga: no máximo um Alert por canal, sem reenviar', async () => {
    const { patientId, context } = await scenario({ channels: ['push'] });
    const { sent, service } = recording(ALL);
    await service.enviar(patientId, message, context);
    const second = await service.enviar(patientId, message, context);
    const concurrent = await Promise.all([
      service.enviar(patientId, message, context),
      service.enviar(patientId, message, context),
    ]);
    assert.equal(sent.length, 1);
    assert.equal(second[0]?.result, 'duplicado');
    assert.deepEqual(
      concurrent.map((o) => o[0]?.result),
      ['duplicado', 'duplicado'],
    );
    assert.equal(
      await prisma.alert.count({ where: { vacancyId: context.vacancyId } }),
      1,
    );
  });
});

describe('preferências do paciente', () => {
  test('só os canais que o paciente ativou são usados', async () => {
    const { patientId, context } = await scenario({ channels: ['email'] });
    const { sent, service } = recording(ALL);
    await service.enviar(patientId, message, context);
    assert.deepEqual(
      sent.map((s) => s.channel),
      ['email'],
    );
  });

  test('WhatsApp não é usado sem telefone verificado', async () => {
    const { patientId, context } = await scenario({ phoneVerified: false });
    const { sent, service } = recording(ALL);
    const recipient = await service.recipientFor(patientId);
    assert.equal(recipient.verifiedPhone, null);
    assert.deepEqual([...recipient.channels].sort(), ['email', 'push']);
    await service.enviar(patientId, message, context);
    assert.deepEqual(sent.map((s) => s.channel).sort(), ['email', 'push']);
    assert.equal((await alertsOf(context)).whatsapp, undefined);
  });

  test('o destinatário vem do banco e o texto é o mesmo em todos os canais', async () => {
    const { patientId, context } = await scenario();
    const { sent, service } = recording(ALL);
    await service.enviar(patientId, message, context);
    assert.equal(sent.length, 3);
    const [first] = sent;
    assert.ok(first);
    assert.equal(first.recipient.patientId, patientId);
    assert.match(first.recipient.email, /@schema\.teste\.local$/);
    assert.equal(first.recipient.verifiedPhone, '+5511999990000');
    assert.ok(first.notification.body.includes(message.vacancyUrl));
    for (const other of sent) {
      assert.equal(other.notification.body, first.notification.body);
      assert.equal(other.notification.title, first.notification.title);
    }
  });

  test('canal ativo sem adapter é ignorado e não grava Alert', async () => {
    const { patientId, context } = await scenario({
      channels: ['push', 'email'],
    });
    const { service } = recording(['push']);
    const outcome = await service.enviar(patientId, message, context);
    assert.equal(outcomeMap(outcome).email, 'sem_adapter');
    assert.deepEqual(await alertsOf(context), { push: 'enviado' });
  });
});

describe('alerta pendente abandonado (HACK-45)', () => {
  async function seedPending(context: AlertContext, ageMs: number) {
    await prisma.alert.create({
      data: {
        ...context,
        channel: 'push',
        result: 'pendente',
        createdAt: new Date(Date.now() - ageMs),
      },
    });
  }

  test('pendente antigo é reivindicado, reenviado e fica enviado', async () => {
    const { patientId, context } = await scenario({ channels: ['push'] });
    await seedPending(context, STALE_PENDING_MS + 1_000);
    const { sent, service } = recording(ALL);
    const outcome = await service.enviar(patientId, message, context);
    assert.equal(outcome[0]?.result, 'enviado');
    assert.equal(sent.length, 1);
    assert.deepEqual(await alertsOf(context), { push: 'enviado' });
  });

  test('pendente recente é envio em andamento: duplicado, sem reenviar', async () => {
    const { patientId, context } = await scenario({ channels: ['push'] });
    await seedPending(context, 1_000);
    const { sent, service } = recording(ALL);
    const outcome = await service.enviar(patientId, message, context);
    assert.equal(outcome[0]?.result, 'duplicado');
    assert.equal(sent.length, 0);
  });

  test('duas chamadas concorrentes sobre o mesmo pendente antigo enviam uma vez', async () => {
    const { patientId, context } = await scenario({ channels: ['push'] });
    await seedPending(context, STALE_PENDING_MS + 1_000);
    const { sent, service } = recording(ALL);
    const outcomes = await Promise.all([
      service.enviar(patientId, message, context),
      service.enviar(patientId, message, context),
    ]);
    assert.equal(sent.length, 1);
    assert.deepEqual(outcomes.map((o) => o[0]?.result).sort(), [
      'duplicado',
      'enviado',
    ]);
  });

  test('falha ao gravar o resultado não derruba o envio já feito', async () => {
    const { patientId, context } = await scenario({ channels: ['push'] });
    let sends = 0;
    // O adapter apaga o Alert durante o envio: o update seguinte falha de verdade
    // no banco (P2025), depois de o fornecedor já ter entregado.
    const vanishing: ChannelAdapter = {
      channel: 'push',
      send: async () => {
        sends++;
        await prisma.alert.deleteMany({
          where: { vacancyId: context.vacancyId },
        });
      },
    };
    const service = new NotificationsService(prisma, [vanishing]);
    const outcome = await service.enviar(patientId, message, context);
    assert.equal(outcome[0]?.result, 'enviado');
    assert.equal(sends, 1);
  });
});

test(
  'canal que não responde em 5 s é cortado e registrado como falha',
  { timeout: CHANNEL_TIMEOUT_MS + 5_000 },
  async () => {
    const { patientId, context } = await scenario({
      channels: ['push', 'email'],
    });
    const { service } = recording(['push', 'email'], { email: 'hang' });
    const started = Date.now();
    const outcome = await service.enviar(patientId, message, context);
    const elapsed = Date.now() - started;
    assert.deepEqual(outcomeMap(outcome), { push: 'enviado', email: 'falhou' });
    assert.ok(
      elapsed >= CHANNEL_TIMEOUT_MS - 100 &&
        elapsed < CHANNEL_TIMEOUT_MS + 2_000,
      `levou ${elapsed} ms`,
    );
    assert.deepEqual(await alertsOf(context), {
      push: 'enviado',
      email: 'falhou',
    });
  },
);

// HACK-32 - porta 4: cancelamento de pendentes de vaga fechada (RN-36)

test('HACK-32 C29 - cancela só pendentes de vaga fechada', async () => {
  const service = app.get(NotificationsService);
  await service.cancelPendingOfClosedVacancies(); // drena sobra de outros arquivos
  const states = [
    'reservada',
    'expirada',
    'cancelada',
    'publicada',
    'alertando',
  ] as const;
  const seeded: {
    state: (typeof states)[number];
    ids: Record<string, string>;
  }[] = [];
  for (const state of states) {
    const { context } = await scenario();
    await prisma.vacancy.update({
      where: { id: context.vacancyId },
      data: { state },
    });
    const ids: Record<string, string> = {};
    for (const [channel, result] of [
      ['push', 'pendente'],
      ['email', 'enviado'],
      ['whatsapp', 'falhou'],
    ] as const) {
      const alert = await prisma.alert.create({
        data: { ...context, channel, result },
      });
      ids[result] = alert.id;
    }
    seeded.push({ state, ids });
  }

  assert.equal(await service.cancelPendingOfClosedVacancies(), 3);

  const closed = new Set(['reservada', 'expirada', 'cancelada']);
  for (const { state, ids } of seeded) {
    for (const [original, id] of Object.entries(ids)) {
      const { result } = await prisma.alert.findUniqueOrThrow({
        where: { id },
      });
      const expected =
        original === 'pendente' && closed.has(state) ? 'cancelado' : original;
      assert.equal(result, expected, `${state}/${original}`);
    }
  }
});
