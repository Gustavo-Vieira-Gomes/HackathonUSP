import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type DayForm, toOpeningHours, WEEKDAYS } from './opening-hours';

function week(): DayForm[] {
  return WEEKDAYS.map(({ weekday }) => ({
    weekday,
    closed: weekday === 0,
    open: '08:00',
    close: weekday === 6 ? '12:00' : '18:00',
  }));
}

test('H16-C27 - domingo fechado, segunda a sexta 08:00–18:00 e sábado 08:00–12:00 viram 6 faixas em minutos', () => {
  assert.deepEqual(
    WEEKDAYS.map((day) => day.weekday),
    [0, 1, 2, 3, 4, 5, 6],
  );
  const expected = [
    { weekday: 1, startMinute: 480, endMinute: 1080 },
    { weekday: 2, startMinute: 480, endMinute: 1080 },
    { weekday: 3, startMinute: 480, endMinute: 1080 },
    { weekday: 4, startMinute: 480, endMinute: 1080 },
    { weekday: 5, startMinute: 480, endMinute: 1080 },
    { weekday: 6, startMinute: 480, endMinute: 720 },
  ];
  const original = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Sao_Paulo']) {
      process.env.TZ = tz;
      assert.deepEqual(toOpeningHours(week()), expected, tz);
    }
  } finally {
    process.env.TZ = original;
  }
});
