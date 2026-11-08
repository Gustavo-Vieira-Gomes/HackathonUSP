import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  AlertContext,
  ChannelAdapter,
  NotificationChannel,
  NotificationMessage,
} from './notification.types';
import {
  NotificationsService,
  STALE_PENDING_MS,
} from './notifications.service';

const message: NotificationMessage = {
  clinicName: 'Clínica Teste',
  examName: 'Ultrassonografia de abdome total',
  startsAt: new Date('2026-11-14T13:00:00Z'),
  priceCents: 30000,
  distanceMeters: 1200,
  preparation: 'jejum de 8 h',
  vacancyUrl: 'https://app.example/vagas/1',
};
const context: AlertContext = {
  vacancyId: 'v1',
  subscriptionId: 's1',
  wave: 1,
};

interface Row {
  id: string;
  channel: NotificationChannel;
  result: string;
  createdAt: Date;
}

/**
 * Banco em memória com uma vaga e uma inscrição: reproduz a unicidade
 * (vaga, inscrição, canal) e o `updateMany` condicional da reivindicação.
 */
function fakePrisma(options: { failUpdate?: boolean } = {}) {
  const rows: Row[] = [];
  const prisma = {
    alert: {
      create: async ({
        data,
      }: {
        data: AlertContext & { channel: NotificationChannel; result: string };
      }) => {
        if (rows.some((r) => r.channel === data.channel)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        const row = {
          id: `a${rows.length + 1}`,
          channel: data.channel,
          result: data.result,
          createdAt: new Date(),
        };
        rows.push(row);
        return { id: row.id };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { result: string };
      }) => {
        if (options.failUpdate) throw new Error('banco fora');
        const row = rows.find((r) => r.id === where.id);
        if (row) row.result = data.result;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          channel: NotificationChannel;
          result: string;
          createdAt: { lt: Date };
        };
        data: { createdAt: Date };
      }) => {
        const matched = rows.filter(
          (r) =>
            r.channel === where.channel &&
            r.result === where.result &&
            r.createdAt < where.createdAt.lt,
        );
        for (const row of matched) row.createdAt = data.createdAt;
        return { count: matched.length };
      },
      findUnique: async ({
        where,
      }: {
        where: {
          vacancyId_subscriptionId_channel: { channel: NotificationChannel };
        };
      }) => {
        const row = rows.find(
          (r) => r.channel === where.vacancyId_subscriptionId_channel.channel,
        );
        return row ? { id: row.id } : null;
      },
    },
  };
  return { rows, prisma: prisma as unknown as PrismaService };
}

/** Alerta já gravado por um processo anterior, criado `ageMs` atrás. */
function seed(
  rows: Row[],
  channel: NotificationChannel,
  result: string,
  ageMs: number,
) {
  rows.push({
    id: `old-${channel}`,
    channel,
    result,
    createdAt: new Date(Date.now() - ageMs),
  });
}

const ok = (channel: NotificationChannel): ChannelAdapter => ({
  channel,
  send: async () => {},
});
const failing = (channel: NotificationChannel): ChannelAdapter => ({
  channel,
  send: async () => {
    throw new Error('fornecedor fora');
  },
});

describe('NotificationsService.enviar', () => {
  it('WhatsApp fora: push e e-mail enviados, Alert registra a falha do WhatsApp', async () => {
    const { rows, prisma } = fakePrisma();
    const service = new NotificationsService(prisma, [
      ok('push'),
      ok('email'),
      failing('whatsapp'),
    ]);
    const outcome = await service.enviar(
      { patientId: 'p1', channels: ['push', 'email', 'whatsapp'] },
      message,
      context,
    );
    assert.deepEqual(
      Object.fromEntries(outcome.map((o) => [o.channel, o.result])),
      { push: 'enviado', email: 'enviado', whatsapp: 'falhou' },
    );
    assert.deepEqual(
      Object.fromEntries(rows.map((r) => [r.channel, r.result])),
      { push: 'enviado', email: 'enviado', whatsapp: 'falhou' },
    );
  });

  it('um paciente, uma vaga: segunda chamada não cria outro Alert nem reenvia', async () => {
    const { rows, prisma } = fakePrisma();
    let sends = 0;
    const counting: ChannelAdapter = {
      channel: 'push',
      send: async () => void sends++,
    };
    const service = new NotificationsService(prisma, [counting]);
    const recipient = { patientId: 'p1', channels: ['push'] as const };
    await service.enviar(recipient, message, context);
    const second = await service.enviar(recipient, message, context);
    assert.equal(rows.length, 1);
    assert.equal(sends, 1);
    assert.equal(second[0]?.result, 'duplicado');
  });

  it('canal sem adapter é ignorado e não grava Alert', async () => {
    const { rows, prisma } = fakePrisma();
    const service = new NotificationsService(prisma, [ok('push')]);
    const outcome = await service.enviar(
      { patientId: 'p1', channels: ['push', 'email'] },
      message,
      context,
    );
    assert.equal(
      outcome.find((o) => o.channel === 'email')?.result,
      'sem_adapter',
    );
    assert.equal(rows.length, 1);
  });

  it('canal repetido na lista envia uma vez só', async () => {
    const { rows, prisma } = fakePrisma();
    const service = new NotificationsService(prisma, [ok('push')]);
    await service.enviar(
      { patientId: 'p1', channels: ['push', 'push'] },
      message,
      context,
    );
    assert.equal(rows.length, 1);
  });
});

describe('NotificationsService.enviar · alerta pendente abandonado (HACK-45)', () => {
  const recipient = { patientId: 'p1', channels: ['push'] as const };
  const counting = () => {
    const state = { sends: 0 };
    const adapter: ChannelAdapter = {
      channel: 'push',
      send: async () => void state.sends++,
    };
    return { state, adapter };
  };

  it('pendente antigo é reivindicado, reenviado e fica enviado', async () => {
    const { rows, prisma } = fakePrisma();
    seed(rows, 'push', 'pendente', STALE_PENDING_MS + 1_000);
    const { state, adapter } = counting();
    const service = new NotificationsService(prisma, [adapter]);
    const outcome = await service.enviar(recipient, message, context);
    assert.equal(outcome[0]?.result, 'enviado');
    assert.equal(state.sends, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.result, 'enviado');
  });

  it('pendente recente pertence a um envio em andamento: duplicado, sem reenviar', async () => {
    const { rows, prisma } = fakePrisma();
    seed(rows, 'push', 'pendente', 1_000);
    const { state, adapter } = counting();
    const service = new NotificationsService(prisma, [adapter]);
    const outcome = await service.enviar(recipient, message, context);
    assert.equal(outcome[0]?.result, 'duplicado');
    assert.equal(state.sends, 0);
  });

  it('alerta antigo já enviado ou falhado não é reenviado', async () => {
    for (const result of ['enviado', 'falhou']) {
      const { rows, prisma } = fakePrisma();
      seed(rows, 'push', result, STALE_PENDING_MS * 10);
      const { state, adapter } = counting();
      const service = new NotificationsService(prisma, [adapter]);
      const outcome = await service.enviar(recipient, message, context);
      assert.equal(outcome[0]?.result, 'duplicado', result);
      assert.equal(state.sends, 0, result);
    }
  });

  it('duas chamadas concorrentes sobre o mesmo pendente antigo enviam uma vez', async () => {
    const { rows, prisma } = fakePrisma();
    seed(rows, 'push', 'pendente', STALE_PENDING_MS + 1_000);
    const { state, adapter } = counting();
    const service = new NotificationsService(prisma, [adapter]);
    const outcomes = await Promise.all([
      service.enviar(recipient, message, context),
      service.enviar(recipient, message, context),
    ]);
    assert.equal(state.sends, 1);
    assert.deepEqual(outcomes.map((o) => o[0]?.result).sort(), [
      'duplicado',
      'enviado',
    ]);
  });

  it('falha ao gravar o resultado não derruba o envio já feito', async () => {
    const { prisma } = fakePrisma({ failUpdate: true });
    const { state, adapter } = counting();
    const service = new NotificationsService(prisma, [adapter]);
    const outcome = await service.enviar(recipient, message, context);
    assert.equal(outcome[0]?.result, 'enviado');
    assert.equal(state.sends, 1);
  });
});
