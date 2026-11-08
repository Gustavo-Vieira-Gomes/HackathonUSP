import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  haversineMeters,
  localWeekdayAndMinute,
  matchesVacancy,
  type MatchableSubscription,
  type MatchableVacancy,
} from './matching-rules';

const clinic = { latitude: -23.5614, longitude: -46.7307 };
// Sábado 2026-11-14 10:00 em São Paulo (UTC-3).
const saturday10h = new Date('2026-11-14T13:00:00Z');
const now = new Date('2026-11-13T13:00:00Z');

const vacancy: MatchableVacancy = {
  startsAt: saturday10h,
  currentPriceCents: 30000,
  clinic,
  requiredLeadMinutes: 8 * 60,
};
const subscription: MatchableSubscription = {
  maxPriceCents: 35000,
  ...clinic,
  radiusMeters: 10_000,
  windows: [{ weekday: 6, startMinute: 9 * 60, endMinute: 12 * 60 }],
};

describe('localWeekdayAndMinute', () => {
  it('usa o fuso de São Paulo, não UTC', () => {
    assert.deepEqual(localWeekdayAndMinute(saturday10h), {
      weekday: 6,
      minute: 600,
    });
    // 01:00 UTC de domingo ainda é sábado 22:00 em São Paulo.
    assert.deepEqual(localWeekdayAndMinute(new Date('2026-11-15T01:00:00Z')), {
      weekday: 6,
      minute: 22 * 60,
    });
  });
});

describe('haversineMeters', () => {
  it('um grau de latitude vale cerca de 111 km', () => {
    const d = haversineMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
    );
    assert.ok(Math.abs(d - 111_195) < 200, `distância ${d}`);
  });
});

describe('matchesVacancy', () => {
  it('vaga dentro de janela, raio, preço e antecedência é candidata', () => {
    assert.equal(matchesVacancy(subscription, vacancy, now), true);
  });

  it('vaga sáb 10h com janela sáb 14h-18h não é candidata', () => {
    const afternoon = {
      ...subscription,
      windows: [{ weekday: 6, startMinute: 840, endMinute: 1080 }],
    };
    assert.equal(matchesVacancy(afternoon, vacancy, now), false);
  });

  it('janela de outro dia da semana não casa', () => {
    const friday = {
      ...subscription,
      windows: [{ weekday: 5, startMinute: 0, endMinute: 1440 }],
    };
    assert.equal(matchesVacancy(friday, vacancy, now), false);
  });

  it('vaga a 12 km com raio de 10 km não é candidata', () => {
    const far = {
      ...vacancy,
      clinic: {
        latitude: clinic.latitude + 12 / 111.195,
        longitude: clinic.longitude,
      },
    };
    assert.equal(matchesVacancy(subscription, far, now), false);
    assert.equal(
      matchesVacancy({ ...subscription, radiusMeters: 13_000 }, far, now),
      true,
    );
  });

  it('preço atual acima do máximo não casa; igual casa', () => {
    assert.equal(
      matchesVacancy({ ...subscription, maxPriceCents: 29999 }, vacancy, now),
      false,
    );
    assert.equal(
      matchesVacancy({ ...subscription, maxPriceCents: 30000 }, vacancy, now),
      true,
    );
  });

  it('antecedência menor que o preparo não casa', () => {
    const late = new Date('2026-11-14T08:00:00Z'); // faltam 5 h; preparo exige 8 h
    assert.equal(matchesVacancy(subscription, vacancy, late), false);
  });
});
