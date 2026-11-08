import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { loadEnv } from '../../config/env';
import {
  closedPortUrl,
  type FakeGeocoder,
  json,
  startFakeGeocoder,
} from '../../testing/fake-geocoder';
import { GeocodingService } from './geocoding.service';

const base = {
  DATABASE_URL: 'postgresql://usuario:senha@127.0.0.1:5432/banco',
  BETTER_AUTH_SECRET: 'segredo-de-teste-com-32-caracteres!',
  BETTER_AUTH_URL: 'http://127.0.0.1:3001',
  WEB_ORIGIN: 'http://127.0.0.1:3000',
};

let fake: FakeGeocoder;
before(async () => {
  fake = await startFakeGeocoder();
});
after(async () => {
  await fake.close();
});

function service(overrides: Record<string, string> = {}) {
  return new GeocodingService(
    loadEnv({
      ...base,
      GEOCODER_URL: fake.url,
      GEOCODER_MIN_INTERVAL_MS: '0',
      ...overrides,
    }),
  );
}

const ADDRESS = 'Av. Paulista, 1000';

test('H16-C13 - cada falha registra uma linha warn com o motivo e a duração, sem o endereço; sucesso não registra', async () => {
  const cases: [string, () => Promise<Record<string, string>>, string][] = [
    [
      'status',
      async () => {
        fake.respond((_req, res) => json(res, 500, {}));
        return {};
      },
      'status=500',
    ],
    [
      'timeout',
      async () => {
        fake.respond(async (_req, res) => {
          await sleep(5100);
          json(res, 200, []);
        });
        return {};
      },
      'timeout',
    ],
    ['rede', async () => ({ GEOCODER_URL: await closedPortUrl() }), 'network'],
    [
      'corpo',
      async () => {
        fake.respond((_req, res) => json(res, 200, { lat: '1' }));
        return {};
      },
      'invalid_body',
    ],
  ];
  for (const [label, arrange, reason] of cases) {
    fake.reset();
    const overrides = await arrange();
    const warn = mock.method(Logger.prototype, 'warn', () => undefined);
    try {
      await assert.rejects(service(overrides).geocode(ADDRESS), (error) => {
        assert.ok(error instanceof ServiceUnavailableException, label);
        assert.equal(error.getStatus(), 503);
        assert.equal(
          (error.getResponse() as { code: string }).code,
          'GEOCODING_UNAVAILABLE',
        );
        return true;
      });
      assert.equal(warn.mock.callCount(), 1, label);
      const line = warn.mock.calls[0]!.arguments.map(String).join(' ');
      assert.ok(line.includes(reason), `${label}: ${line}`);
      assert.match(line, /\d+ms/, label);
      assert.ok(!line.includes(ADDRESS), `${label}: ${line}`);
    } finally {
      warn.mock.restore();
    }
  }
  assert.equal(cases.length, 4);

  fake.reset();
  const warn = mock.method(Logger.prototype, 'warn', () => undefined);
  try {
    assert.ok(await service().geocode(ADDRESS));
    assert.equal(warn.mock.callCount(), 0);
  } finally {
    warn.mock.restore();
  }
});

test('H16-C15 - chamada GET /search com format, limit, countrycodes, q e User-Agent; devolve ponto ou null', async () => {
  fake.reset();
  const point = await service().geocode(ADDRESS);
  assert.deepEqual(point, { latitude: -23.5617, longitude: -46.656 });
  assert.equal(fake.requests.length, 1);
  const [request] = fake.requests;
  assert.equal(request!.url.pathname, '/search');
  const params = Object.fromEntries(request!.url.searchParams);
  assert.deepEqual(params, {
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'br',
    q: ADDRESS,
  });
  assert.equal(request!.headers['user-agent'], 'hackathon-usp-marketplace/0.1');

  fake.reset();
  fake.respond((_req, res) => json(res, 200, []));
  assert.equal(await service().geocode(ADDRESS), null);

  fake.reset();
  await service({ GEOCODER_USER_AGENT: 'outro-agente/2.0' }).geocode(ADDRESS);
  assert.equal(fake.requests[0]!.headers['user-agent'], 'outro-agente/2.0');
  fake.reset();
});

test('H16-C16 - com intervalo de 1000 ms as chamadas chegam espaçadas e falha não é refeita; com 0 não esperam', async () => {
  fake.reset();
  let first = true;
  fake.respond((_req, res) => {
    if (first) {
      first = false;
      json(res, 500, {});
      return;
    }
    json(res, 200, [{ lat: '-23.5617', lon: '-46.6560' }]);
  });
  const spaced = service({ GEOCODER_MIN_INTERVAL_MS: '1000' });
  const warn = mock.method(Logger.prototype, 'warn', () => undefined);
  try {
    const results = await Promise.allSettled([
      spaced.geocode(ADDRESS),
      spaced.geocode(ADDRESS),
      spaced.geocode(ADDRESS),
    ]);
    assert.deepEqual(
      results.map((r) => r.status),
      ['rejected', 'fulfilled', 'fulfilled'],
    );
  } finally {
    warn.mock.restore();
  }
  assert.equal(fake.requests.length, 3, 'falha refeita ou chamada perdida');
  const [a, b, c] = fake.requests.map((r) => r.at);
  assert.ok(b! - a! >= 1000, `1ª→2ª ${b! - a!} ms`);
  assert.ok(c! - b! >= 1000, `2ª→3ª ${c! - b!} ms`);

  fake.reset();
  const free = service({ GEOCODER_MIN_INTERVAL_MS: '0' });
  await Promise.all([
    free.geocode(ADDRESS),
    free.geocode(ADDRESS),
    free.geocode(ADDRESS),
  ]);
  const times = fake.requests.map((r) => r.at);
  assert.equal(times.length, 3);
  assert.ok(
    Math.max(...times) - Math.min(...times) < 500,
    `sem intervalo, espalhou ${Math.max(...times) - Math.min(...times)} ms`,
  );
  fake.reset();
});
