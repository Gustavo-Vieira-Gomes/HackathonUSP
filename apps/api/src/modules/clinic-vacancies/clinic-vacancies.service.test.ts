import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClinicVacanciesService } from './clinic-vacancies.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ClockService } from '../clock/clock.service';
import type { PricingService } from '../vacancies/pricing.service';
import type { VacanciesService } from '../vacancies/vacancies.service';
import type { NoShowMotorService } from './no-show-motor.service';

const clinicId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const startsAt = new Date('2026-11-08T17:00:00Z');
function fixture(now: string, preparationHours = 0) {
  const calls: string[] = [];
  const reservation = {
    id,
    state: 'confirmada',
    depositCents: 2000,
    vacancyId: id,
    slot: { startsAt, clinicId, exam: { toleranceMinutes: 15 } },
  };
  const db = {
    exam: {
      findFirst: async () => ({
        id,
        preparationHours,
        minLeadMinutes: 60,
        fullPriceCents: 10000,
        floorPriceCents: 5000,
        priceSteps: [],
      }),
    },
    reservation: {
      findFirst: async () => reservation,
      updateMany: async (args: { data: unknown }) => {
        assert.deepEqual(args.data, { state: 'no_show' });
        calls.push('reservation');
        return { count: 1 };
      },
    },
    transition: {
      create: async () => {
        calls.push('transition');
      },
    },
    slot: {
      create: async () => {
        calls.push('slot');
        return { id };
      },
    },
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(db),
  };
  const clock = { refresh: async () => 0, now: () => new Date(now) };
  const pricing = {
    publishWithinDailyCap: async (
      _: string,
      run: (tx: unknown) => Promise<unknown>,
    ) => {
      calls.push('cap');
      return run(db);
    },
  };
  const vacancies = {
    publish: async () => {
      calls.push('publish');
      return { id };
    },
    transition: async (_: string, state: string) => {
      assert.equal(state, 'cancelada');
      calls.push('cancel');
    },
  };
  const motor = {
    onDeclared: async () => {
      calls.push('motor');
    },
  };
  return {
    service: new ClinicVacanciesService(
      db as unknown as PrismaService,
      clock as unknown as ClockService,
      pricing as unknown as PricingService,
      vacancies as unknown as VacanciesService,
      motor as unknown as NoShowMotorService,
    ),
    calls,
    reservation,
    db,
  };
}

test('H20: USG com preparo de 8h não publica para daqui a 3h', async () => {
  const f = fixture('2026-11-08T14:00:00Z', 8);
  await assert.rejects(
    f.service.publish(clinicId, {
      examId: id,
      startsAt: startsAt.toISOString(),
      endsAt: '2026-11-08T18:00:00Z',
      reason: 'vazio',
    }),
    /antecedência menor que o preparo/,
  );
  assert.deepEqual(f.calls, []);
});
test('H20: antecedência igual à mínima não publica', async () => {
  const f = fixture('2026-11-08T16:00:00Z');
  await assert.rejects(
    f.service.publish(clinicId, {
      examId: id,
      startsAt: startsAt.toISOString(),
      endsAt: '2026-11-08T18:00:00Z',
      reason: 'vazio',
    }),
    /antecedência mínima/,
  );
});
test('H20: publicação passa pelo teto e serviço único de vagas', async () => {
  const f = fixture('2026-11-08T14:00:00Z');
  await f.service.publish(clinicId, {
    examId: id,
    startsAt: startsAt.toISOString(),
    endsAt: '2026-11-08T18:00:00Z',
    reason: 'vazio',
  });
  assert.deepEqual(f.calls, ['cap', 'slot', 'publish']);
});
test('H20: no-show 14h10 bloqueado, 14h16 registra e retém sinal', async () => {
  const early = fixture('2026-11-08T17:10:00Z');
  await assert.rejects(early.service.declareNoShow(clinicId, id), /tolerância/);
  assert.deepEqual(early.calls, []);
  const late = fixture('2026-11-08T17:16:00Z');
  assert.deepEqual(await late.service.declareNoShow(clinicId, id), {
    id,
    state: 'no_show',
  });
  assert.equal(late.reservation.depositCents, 2000);
  assert.deepEqual(late.calls, [
    'reservation',
    'transition',
    'cancel',
    'motor',
  ]);
});
test('H20: reserva alheia ou inexistente não declara falta', async () => {
  const f = fixture('2026-11-08T17:16:00Z');
  Object.assign(f.db.reservation, {
    findFirst: async (args: { where: unknown }) => {
      assert.deepEqual(args.where, { id, slot: { clinicId } });
      return null;
    },
  });
  await assert.rejects(
    f.service.declareNoShow(clinicId, id),
    /Reserva não encontrada/,
  );
  assert.deepEqual(f.calls, []);
});
