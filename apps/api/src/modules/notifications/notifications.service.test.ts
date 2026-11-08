import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  AlertContext,
  ChannelAdapter,
  NotificationChannel,
  NotificationMessage,
} from './notification.types';
import { NotificationsService } from './notifications.service';

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
}

/** Banco em memória que reproduz só a unicidade (vaga, inscrição, canal). */
function fakePrisma() {
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
        const row = rows.find((r) => r.id === where.id);
        if (row) row.result = data.result;
      },
    },
  };
  return { rows, prisma: prisma as unknown as PrismaService };
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
