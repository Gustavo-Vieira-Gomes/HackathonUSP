import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrismaService } from '../../prisma/prisma.service';
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

type SubscriptionWhere = { alerts?: { none?: { vacancyId?: string } } };

/**
 * Prisma em memória: devolve as inscrições em ordem e aplica só o filtro
 * `alerts.none`, que é o comportamento sob teste. TUSS e validade não variam aqui.
 */
function fakePrisma(
  subscriptions: ReturnType<typeof subscription>[],
  alerted: Set<string>,
) {
  const prisma = {
    vacancy: { findUniqueOrThrow: async () => vacancy },
    subscription: {
      findMany: async ({ where }: { where: SubscriptionWhere }) => {
        const excluded = where.alerts?.none?.vacancyId;
        return subscriptions.filter((s) => !(excluded && alerted.has(s.id)));
      },
    },
  };
  return prisma as unknown as PrismaService;
}

describe('MatchingService.candidatos', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => subscription(i + 1));

  it('sem alertas, devolve todos os candidatos na ordem de inscrição', async () => {
    const service = new MatchingService(fakePrisma(twelve, new Set()));
    const result = await service.candidatos('v1', now);
    assert.deepEqual(
      result.map((s) => s.id),
      twelve.map((s) => s.id),
    );
  });

  it('depois de alertar os 5 primeiros, devolve só os seguintes', async () => {
    const alerted = new Set(['s1', 's2', 's3', 's4', 's5']);
    const service = new MatchingService(fakePrisma(twelve, alerted));
    const result = await service.candidatos('v1', now);
    assert.deepEqual(
      result.slice(0, 5).map((s) => s.id),
      ['s6', 's7', 's8', 's9', 's10'],
    );
    assert.ok(result.every((s) => !alerted.has(s.id)));
  });
});
