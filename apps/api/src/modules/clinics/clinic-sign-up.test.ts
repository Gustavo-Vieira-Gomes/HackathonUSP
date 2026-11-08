import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { clinicSignUpResponseSchema } from '@hackathon/contracts';
import { Logger } from '@nestjs/common';
import { closedPortUrl, json } from '../../testing/fake-geocoder';
import {
  clinicSignUpBody,
  randomCnes,
  signUp,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';

let t: TestApp;
before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.close();
});

const geocoder = () => {
  assert.ok(t.geocoder);
  return t.geocoder;
};
const users = (email: string) => t.prisma.user.count({ where: { email } });
const clinics = (cnes: string) => t.prisma.clinic.count({ where: { cnes } });

interface ErrorBody {
  code?: string;
  message?: string;
  fields?: string[];
}

async function signUpClinic(body: Record<string, unknown>) {
  const response = await signUp(t, 'clinica', body);
  const text = await response.text();
  return {
    response,
    status: response.status,
    body: (text ? JSON.parse(text) : {}) as ErrorBody & Record<string, unknown>,
  };
}

/** Espiona todos os níveis do Logger do Nest; devolve as linhas como texto. */
function captureLogs() {
  const levels = ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const;
  const spies = levels.map((level) => ({
    level,
    spy: mock.method(Logger.prototype, level, () => undefined),
  }));
  const lines = (level?: string) =>
    spies
      .filter((entry) => level === undefined || entry.level === level)
      .flatMap((entry) =>
        entry.spy.mock.calls.map((call) =>
          call.arguments.map((arg) => String(arg)).join(' '),
        ),
      );
  return {
    lines,
    restore: () => spies.forEach((entry) => entry.spy.mock.restore()),
  };
}

test('H16-C1 - cadastro válido responde 200 com coordenada, cookie HttpOnly e grava User, Clinic e expediente', async () => {
  geocoder().reset();
  const email = t.email();
  const body = clinicSignUpBody(email);
  const { response, status, body: out } = await signUpClinic(body);
  assert.equal(status, 200, JSON.stringify(out));
  const parsed = clinicSignUpResponseSchema.parse(out);
  assert.equal(parsed.user.role, 'clinica');
  assert.equal(parsed.user.email, email);
  assert.equal(parsed.clinic.latitude, -23.5617);
  assert.equal(parsed.clinic.longitude, -46.656);
  const cookie = response.headers
    .getSetCookie()
    .find((line) => line.includes('session_token='));
  assert.ok(cookie, 'sem cookie de sessão');
  assert.match(cookie, /;\s*HttpOnly/i);

  assert.equal(await users(email), 1);
  const clinic = await t.prisma.clinic.findUniqueOrThrow({
    where: { cnes: body.cnes as string },
    include: { openingHours: true, user: true },
  });
  assert.equal(clinic.id, parsed.clinic.id);
  assert.equal(clinic.user.email, email);
  assert.equal(clinic.name, body.name);
  assert.equal(clinic.address, body.address);
  assert.equal(clinic.technicalManager, body.technicalManager);
  assert.equal(clinic.latitude, -23.5617);
  assert.equal(clinic.longitude, -46.656);
  assert.equal(clinic.openingHours.length, 2);
  const stored = clinic.openingHours
    .map(({ weekday, startMinute, endMinute }) => ({
      weekday,
      startMinute,
      endMinute,
    }))
    .sort((a, b) => a.weekday - b.weekday);
  assert.deepEqual(stored, body.openingHours);
});

test('H16-C2 - cada campo obrigatório ausente responde 422 VALIDATION_FAILED com o campo, sem geocodificar nem gravar', async () => {
  const required = [
    'name',
    'email',
    'password',
    'address',
    'cnes',
    'technicalManager',
    'openingHours',
  ];
  for (const field of required) {
    geocoder().reset();
    const email = t.email();
    const body = clinicSignUpBody(email);
    delete body[field];
    const { status, body: out } = await signUpClinic(body);
    assert.equal(status, 422, field);
    assert.equal(out.code, 'VALIDATION_FAILED', field);
    assert.ok(out.fields?.includes(field), `${field}: ${out.fields}`);
    assert.equal(geocoder().requests.length, 0, `${field}: geocodificou`);
    assert.equal(await users(email), 0, field);
    if (typeof body.cnes === 'string')
      assert.equal(await clinics(body.cnes), 0);
  }
  assert.equal(required.length, 7);
});

test('H16-C3 - CNES com 6 dígitos responde 422 com cnes em fields e não cria User', async () => {
  const email = t.email();
  const { status, body } = await signUpClinic(
    clinicSignUpBody(email, { cnes: '123456' }),
  );
  assert.equal(status, 422);
  assert.equal(body.code, 'VALIDATION_FAILED');
  assert.ok(body.fields?.includes('cnes'), String(body.fields));
  assert.equal(await users(email), 0);
});

test('H16-C4 - faixas sobrepostas respondem 422 com openingHours.1.startMinute e nada é gravado', async () => {
  const email = t.email();
  const cnes = randomCnes();
  const { status, body } = await signUpClinic(
    clinicSignUpBody(email, {
      cnes,
      openingHours: [
        { weekday: 2, startMinute: 480, endMinute: 720 },
        { weekday: 2, startMinute: 700, endMinute: 900 },
      ],
    }),
  );
  assert.equal(status, 422);
  assert.ok(
    body.fields?.includes('openingHours.1.startMinute'),
    String(body.fields),
  );
  assert.equal(await users(email), 0);
  assert.equal(await clinics(cnes), 0);
  assert.equal(
    await t.prisma.clinicOpeningHours.count({ where: { clinic: { cnes } } }),
    0,
  );
});

test('H16-C5 - campo fora do contrato responde 422 com o campo em fields', async () => {
  const extras: Record<string, unknown>[] = [
    { role: 'paciente' },
    { clinicId: '00000000-0000-4000-8000-000000000000' },
    { latitude: -23.5 },
    { longitude: -46.6 },
  ];
  for (const extra of extras) {
    const email = t.email();
    const { status, body } = await signUpClinic(clinicSignUpBody(email, extra));
    const [field] = Object.keys(extra);
    assert.equal(status, 422, field);
    assert.equal(body.code, 'VALIDATION_FAILED', field);
    assert.ok(body.fields?.includes(field!), `${field}: ${body.fields}`);
    assert.equal(await users(email), 0, field);
  }
  assert.equal(extras.length, 4);
});

test('H16-C7 - endereço sem resultado responde 422 ADDRESS_NOT_FOUND sem cookie e sem gravar', async () => {
  geocoder().reset();
  geocoder().respond((_req, res) => json(res, 200, []));
  try {
    const email = t.email();
    const body = clinicSignUpBody(email);
    const { response, status, body: out } = await signUpClinic(body);
    assert.equal(status, 422);
    assert.equal(out.code, 'ADDRESS_NOT_FOUND');
    assert.deepEqual(out.fields, ['address']);
    assert.deepEqual(response.headers.getSetCookie(), []);
    assert.equal(await users(email), 0);
    assert.equal(await clinics(body.cnes as string), 0);
  } finally {
    geocoder().reset();
  }
});

test('H16-C8 - falha do geocodificador responde 503 GEOCODING_UNAVAILABLE sem cookie e sem gravar', async () => {
  const failures: [
    string,
    Parameters<NonNullable<TestApp['geocoder']>['respond']>[0],
  ][] = [
    ['status 500', (_req, res) => json(res, 500, { error: 'x' })],
    ['status 429', (_req, res) => json(res, 429, { error: 'x' })],
    ['corpo não lista', (_req, res) => json(res, 200, {})],
    [
      'lat inválida',
      (_req, res) => json(res, 200, [{ lat: 'abc', lon: '-46.6' }]),
    ],
    [
      'atraso de 5100 ms',
      async (_req, res) => {
        await sleep(5100);
        json(res, 200, [{ lat: '-23.5617', lon: '-46.6560' }]);
      },
    ],
  ];
  const check = async (app: TestApp, label: string) => {
    const email = app.email();
    const body = clinicSignUpBody(email);
    const started = Date.now();
    const response = await signUp(app, 'clinica', body);
    const elapsed = Date.now() - started;
    const out = (await response.json()) as ErrorBody;
    assert.equal(response.status, 503, label);
    assert.equal(out.code, 'GEOCODING_UNAVAILABLE', label);
    assert.deepEqual(response.headers.getSetCookie(), [], label);
    assert.equal(await app.prisma.user.count({ where: { email } }), 0, label);
    assert.equal(
      await app.prisma.clinic.count({ where: { cnes: body.cnes as string } }),
      0,
      label,
    );
    return elapsed;
  };
  for (const [label, handler] of failures) {
    geocoder().reset();
    geocoder().respond(handler);
    const elapsed = await check(t, label);
    if (label.startsWith('atraso')) {
      assert.ok(elapsed < 6000, `timeout respondeu em ${elapsed} ms`);
    }
  }
  geocoder().reset();

  const offline = await startTestApp({ GEOCODER_URL: await closedPortUrl() });
  try {
    await check(offline, 'rede');
  } finally {
    await offline.close();
  }
  assert.equal(failures.length + 1, 6);
});

test('H16-C9 - e-mail já cadastrado responde 422 e não grava segundo User nem Clinic', async () => {
  const email = t.email();
  const first = await signUpClinic(clinicSignUpBody(email));
  assert.equal(first.status, 200);
  const cnes = randomCnes();
  const { status } = await signUpClinic(clinicSignUpBody(email, { cnes }));
  assert.equal(status, 422);
  assert.equal(await users(email), 1);
  assert.equal(await clinics(cnes), 0);
});

test('H16-C10 - CNES de outra clínica responde 422 CNES_TAKEN sem geocodificar e sem gravar', async () => {
  const cnes = randomCnes();
  const first = await signUpClinic(clinicSignUpBody(t.email(), { cnes }));
  assert.equal(first.status, 200);
  geocoder().reset();
  const email = t.email();
  const { response, status, body } = await signUpClinic(
    clinicSignUpBody(email, { cnes }),
  );
  assert.equal(status, 422);
  assert.equal(body.code, 'CNES_TAKEN');
  assert.deepEqual(body.fields, ['cnes']);
  assert.deepEqual(response.headers.getSetCookie(), []);
  assert.equal(await users(email), 0);
  assert.equal(await clinics(cnes), 1);
  assert.equal(geocoder().requests.length, 0);
});

test('H16-C11 - corrida de CNES: uma responde 200, a outra 422 CNES_TAKEN, perdedor apagado e log sem e-mail', async () => {
  geocoder().reset();
  // As duas passam pela conferência prévia do CNES; o geocodificador só responde
  // quando a segunda requisição chegou (sinal explícito, sem sleep).
  let release!: () => void;
  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  geocoder().respond(async (_req, res) => {
    if (geocoder().requests.length >= 2) release();
    await bothArrived;
    json(res, 200, [{ lat: '-23.5617', lon: '-46.6560' }]);
  });
  const logs = captureLogs();
  try {
    const cnes = randomCnes();
    const emails = [t.email(), t.email()];
    const results = await Promise.all(
      emails.map((email) => signUpClinic(clinicSignUpBody(email, { cnes }))),
    );
    assert.deepEqual(
      results.map((r) => r.status).sort(),
      [200, 422],
      JSON.stringify(results.map((r) => r.body)),
    );
    const loserIndex = results.findIndex((r) => r.status === 422);
    const loser = results[loserIndex]!;
    const winnerEmail = emails[1 - loserIndex]!;
    const loserEmail = emails[loserIndex]!;
    assert.equal(loser.body.code, 'CNES_TAKEN');
    assert.deepEqual(loser.body.fields, ['cnes']);
    assert.deepEqual(loser.response.headers.getSetCookie(), []);
    assert.equal(await clinics(cnes), 1);
    assert.equal(await users(winnerEmail), 1);
    assert.equal(await users(loserEmail), 0);

    // C14: uma linha warn com CNES_TAKEN e o id do User removido, sem e-mail.
    const warn = logs
      .lines('warn')
      .filter((line) => line.includes('CNES_TAKEN'));
    assert.equal(warn.length, 1, JSON.stringify(logs.lines()));
    const removedId = warn[0]!.match(/userId=(\S+)/)?.[1];
    assert.ok(removedId, warn[0]);
    assert.equal(await t.prisma.user.count({ where: { id: removedId } }), 0);
    for (const line of logs.lines()) {
      assert.ok(!line.includes(loserEmail), `log com e-mail: ${line}`);
    }
  } finally {
    logs.restore();
    geocoder().reset();
  }
});

test('H16-C13 - timeout do geocodificador registra warn com timeout e duração, sem endereço, e-mail ou senha', async () => {
  geocoder().reset();
  geocoder().respond(async (_req, res) => {
    await sleep(5100);
    json(res, 200, []);
  });
  const logs = captureLogs();
  try {
    const email = t.email();
    const body = clinicSignUpBody(email, {
      address: 'Rua Única de Teste, 4321',
      password: 'senha-secreta-unica',
    });
    const { status } = await signUpClinic(body);
    assert.equal(status, 503);
    const warn = logs.lines('warn');
    assert.ok(
      warn.some((line) => /timeout/.test(line) && /\d+ms/.test(line)),
      JSON.stringify(warn),
    );
    for (const line of logs.lines()) {
      for (const secret of [
        email,
        'Rua Única de Teste',
        'senha-secreta-unica',
      ]) {
        assert.ok(!line.includes(secret), `log com ${secret}: ${line}`);
      }
    }
  } finally {
    logs.restore();
    geocoder().reset();
  }
});
