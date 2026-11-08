import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrismaService } from '../../prisma/prisma.service';
import { STALE_PENDING_MS } from '../notifications/notifications.service';
import { MatchingService } from './matching.service';

const clinic = { latitude: -23.5614, longitude: -46.7307 };
const startsAt = new Date('2026-11-14T13:00:00Z'); // sábado 10h em São Paulo
const now = new Date('2026-11-13T13:00:00Z');

const vacancy = {
  id: 'v1',
  currentPriceCents: 30000,
  slot: {
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 60_000),
    clinic,
    exam: { tussCode: '40901122', minLeadMinutes: 120, preparationHours: 8 },
  },
};

function subscription(n: number) {
  return {
    id: `s${n}`,
    patientId: `p${n}`,
    tussCode: '40901122',
    maxPriceCents: 35000,
    ...clinic,
    radiusMeters: 10_000,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, n)),
    windows: [{ weekday: 6, startMinute: 9 * 60, endMinute: 12 * 60 }],
  };
}

interface AlertRow {
  vacancyId: string;
  result: string;
  createdAt: Date;
}

type AlertWhere = {
  vacancyId: string;
  OR: [{ result: { not: string } }, { createdAt: { gte: Date } }];
};
type SubscriptionWhere = { alerts: { none: AlertWhere } };

/** Um alerta "conta" para o filtro `none` quando casa com todas as condições. */
function alertMatches(alert: AlertRow, where: AlertWhere): boolean {
  const [notResult, recent] = where.OR;
  return (
    alert.vacancyId === where.vacancyId &&
    (alert.result !== notResult.result.not ||
      alert.createdAt >= recent.createdAt.gte)
  );
}

/**
 * Prisma em memória: devolve as inscrições em ordem e aplica só o filtro
 * `alerts.none`, com a mesma semântica do banco. TUSS e validade não variam aqui.
 */
function fakePrisma(
  subscriptions: ReturnType<typeof subscription>[],
  alerts: Map<string, AlertRow>,
) {
  const prisma = {
    vacancy: { findUniqueOrThrow: async () => vacancy },
    subscription: {
      findMany: async ({ where }: { where: SubscriptionWhere }) =>
        subscriptions.filter((s) => {
          const alert = alerts.get(s.id);
          return !(alert && alertMatches(alert, where.alerts.none));
        }),
    },
  };
  return prisma as unknown as PrismaService;
}

function alertsFor(
  ids: string[],
  result: string,
  ageMs = 0,
): Map<string, AlertRow> {
  const createdAt = new Date(Date.now() - ageMs);
  return new Map(ids.map((id) => [id, { vacancyId: 'v1', result, createdAt }]));
}

describe('MatchingService.candidatos', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => subscription(i + 1));

  it('sem alertas, devolve todos os candidatos na ordem de inscrição', async () => {
    const service = new MatchingService(fakePrisma(twelve, new Map()));
    const result = await service.candidatos('v1', now);
    assert.deepEqual(
      result.map((s) => s.id),
      twelve.map((s) => s.id),
    );
  });

  it('depois de alertar os 5 primeiros, devolve só os seguintes', async () => {
    const alerted = ['s1', 's2', 's3', 's4', 's5'];
    const service = new MatchingService(
      fakePrisma(twelve, alertsFor(alerted, 'enviado')),
    );
    const result = await service.candidatos('v1', now);
    assert.deepEqual(
      result.slice(0, 5).map((s) => s.id),
      ['s6', 's7', 's8', 's9', 's10'],
    );
    assert.ok(result.every((s) => !alerted.includes(s.id)));
  });

  it('alerta falhado também tira a inscrição da fila', async () => {
    const service = new MatchingService(
      fakePrisma(twelve, alertsFor(['s1'], 'falhou', STALE_PENDING_MS * 10)),
    );
    const result = await service.candidatos('v1', now);
    assert.equal(result[0]?.id, 's2');
  });

  it('pendente abandonado (11 s) volta para a fila para ser reenviado (HACK-45)', async () => {
    const service = new MatchingService(
      fakePrisma(twelve, alertsFor(['s1'], 'pendente', 11_000)),
    );
    const result = await service.candidatos('v1', now);
    assert.equal(result[0]?.id, 's1');
  });

  it('pendente recente é um envio em andamento e continua fora', async () => {
    const service = new MatchingService(
      fakePrisma(twelve, alertsFor(['s1'], 'pendente', 1_000)),
    );
    const result = await service.candidatos('v1', now);
    assert.equal(result[0]?.id, 's2');
  });
});
