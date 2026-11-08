import assert from 'node:assert/strict';
import { test } from 'node:test';
import { subscriptionCreateBodySchema } from './subscriptions';
const valid = {
  tussCode: '40901122',
  address: 'Av. Paulista, 1000',
  radiusMeters: 10000,
  maxPriceCents: 55000,
  windows: [{ weekday: 1, startMinute: 1080, endMinute: 1260 }],
};
test('inscrição valida região, janelas e localização de posso ir hoje', () => {
  assert.ok(subscriptionCreateBodySchema.safeParse(valid).success);
  for (const invalid of [
    { ...valid, address: undefined },
    { ...valid, windows: [] },
    { ...valid, latitude: 91 },
    { ...valid, canGoToday: true },
    { ...valid, windows: [{ weekday: 7, startMinute: 0, endMinute: 60 }] },
    { ...valid, windows: [{ weekday: 1, startMinute: 60, endMinute: 60 }] },
  ])
    assert.equal(
      subscriptionCreateBodySchema.safeParse(invalid).success,
      false,
    );
});
