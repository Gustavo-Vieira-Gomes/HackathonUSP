import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from './clock.service';

test('advance recusa zero, negativo e fração sem tocar no banco', async () => {
  const clock = new ClockService({} as PrismaService);
  for (const minutes of [0, -5, 1.5, Number.NaN]) {
    await assert.rejects(
      () => clock.advance(minutes),
      RangeError,
      String(minutes),
    );
  }
});
