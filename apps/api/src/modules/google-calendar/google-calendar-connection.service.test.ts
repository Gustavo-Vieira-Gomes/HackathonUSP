import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, mock, test } from 'node:test';
import { Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';
import {
  CalendarNotConnectedError,
  GoogleCalendarConnectionService,
  isCredentialsRejectedError,
} from './google-calendar-connection.service';
import { GoogleCalendarModule } from './google-calendar.module';
import {
  type GoogleCredentials,
  GoogleOAuthClient,
  type RefreshedTokens,
} from './google-oauth.client';
import { decryptToken, encryptToken } from './token-cipher';

/**
 * Porta 3 (API do módulo para o HACK-19) contra o Postgres do worktree, com o
 * `GoogleOAuthClient` da instância trocado por um falso.
 */

const GOOGLE_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: 'cliente-de-teste.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'segredo-do-cliente-de-teste',
  GOOGLE_OAUTH_REDIRECT_URI:
    'http://127.0.0.1:3000/api/google-calendar/callback',
  GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString('base64'),
};
const KEY = Buffer.from(GOOGLE_ENV.GOOGLE_TOKEN_ENCRYPTION_KEY, 'base64');

let t: TestApp;
let service: GoogleCalendarConnectionService;
const calendarFor = {
  calls: 0,
  credentials: undefined as GoogleCredentials | undefined,
  onTokens: undefined as
    ((tokens: RefreshedTokens) => Promise<void>) | undefined,
  client: { fake: 'calendar' },
};

before(async () => {
  t = await startTestApp(GOOGLE_ENV);
  service = t.app.get(GoogleCalendarConnectionService);
  const client = t.app.get(GoogleOAuthClient);
  mock.method(
    client,
    'calendarFor',
    (
      credentials: GoogleCredentials,
      onTokens: (tokens: RefreshedTokens) => Promise<void>,
    ) => {
      calendarFor.calls++;
      calendarFor.credentials = credentials;
      calendarFor.onTokens = onTokens;
      return calendarFor.client;
    },
  );
  for (const name of [
    'buildAuthUrl',
    'exchangeCode',
    'listOwnedCalendars',
  ] as const) {
    mock.method(client, name, () =>
      assert.fail(`${name} não devia ser chamado`),
    );
  }
});

after(async () => {
  mock.restoreAll();
  await t.close();
});

async function newClinic(): Promise<string> {
  const account = await signUpWithCookie(t, 'clinica');
  assert.ok(account.clinicId);
  return account.clinicId;
}

type Status = 'DISCONNECTED' | 'AWAITING_CALENDAR' | 'CONNECTED' | 'EXPIRED';

/** Linha gravada direto, com tokens no formato da porta 2. */
async function seed(clinicId: string, status: Status) {
  const tokens = {
    refresh: `1//refresh-${randomUUID()}`,
    access: `ya29.access-${randomUUID()}`,
    expiry: new Date(Date.now() + 3_600_000),
  };
  const hasTokens = status === 'AWAITING_CALENDAR' || status === 'CONNECTED';
  await t.prisma.calendarConnection.create({
    data: {
      clinicId,
      status,
      refreshToken: hasTokens
        ? encryptToken(KEY, clinicId, tokens.refresh)
        : null,
      accessToken: hasTokens
        ? encryptToken(KEY, clinicId, tokens.access)
        : null,
      accessTokenExpiresAt: hasTokens ? tokens.expiry : null,
      calendarId:
        status === 'CONNECTED' || status === 'EXPIRED'
          ? 'exames@exemplo.com'
          : null,
      calendarName:
        status === 'CONNECTED' || status === 'EXPIRED' ? 'Exames' : null,
      connectedAt: status === 'CONNECTED' ? new Date() : null,
    },
  });
  return tokens;
}

test('H18-C38 - getAuthorizedCalendar de clínica CONNECTED devolve o cliente e a agenda, com tokens decifrados', async () => {
  const clinicId = await newClinic();
  const tokens = await seed(clinicId, 'CONNECTED');
  calendarFor.calls = 0;
  const result = await service.getAuthorizedCalendar(clinicId);
  assert.equal(result.calendarId, 'exames@exemplo.com');
  assert.equal(result.calendar, calendarFor.client);
  assert.equal(calendarFor.calls, 1);
  assert.deepEqual(calendarFor.credentials, {
    refreshToken: tokens.refresh,
    accessToken: tokens.access,
    expiryDate: tokens.expiry.getTime(),
  });
});

test('H18-C40 - getAuthorizedCalendar sem linha, AWAITING_CALENDAR ou EXPIRED lança CalendarNotConnectedError sem Google', async () => {
  const none = await newClinic();
  const awaiting = await newClinic();
  await seed(awaiting, 'AWAITING_CALENDAR');
  const expired = await newClinic();
  await seed(expired, 'EXPIRED');
  calendarFor.calls = 0;
  for (const clinicId of [none, awaiting, expired]) {
    await assert.rejects(
      service.getAuthorizedCalendar(clinicId),
      CalendarNotConnectedError,
    );
  }
  assert.equal(calendarFor.calls, 0);
});

test('H18-C41 - renovação pelo onTokens grava o novo access token cifrado e a validade; refresh igual', async () => {
  const clinicId = await newClinic();
  const tokens = await seed(clinicId, 'CONNECTED');
  await service.getAuthorizedCalendar(clinicId);
  assert.ok(calendarFor.onTokens);
  const renewed = {
    accessToken: `ya29.novo-${randomUUID()}`,
    expiryDate: Date.now() + 7_200_000,
  };
  await calendarFor.onTokens(renewed);
  const row = await t.prisma.calendarConnection.findUnique({
    where: { clinicId },
  });
  assert.ok(row?.accessToken && row.refreshToken);
  assert.match(row.accessToken, /^v1\./);
  assert.equal(
    decryptToken(KEY, clinicId, row.accessToken),
    renewed.accessToken,
  );
  assert.equal(row.accessTokenExpiresAt?.getTime(), renewed.expiryDate);
  assert.equal(decryptToken(KEY, clinicId, row.refreshToken), tokens.refresh);
});

test('H18-C42 - markCredentialsRejected: EXPIRED, tokens nulos, agenda mantida; repetir não muda nada', async () => {
  const clinicId = await newClinic();
  await seed(clinicId, 'CONNECTED');
  await service.markCredentialsRejected(clinicId);
  const first = await t.prisma.calendarConnection.findUnique({
    where: { clinicId },
  });
  assert.equal(first?.status, 'EXPIRED');
  assert.equal(first?.refreshToken, null);
  assert.equal(first?.accessToken, null);
  assert.equal(first?.calendarId, 'exames@exemplo.com');
  assert.equal(first?.calendarName, 'Exames');
  await service.markCredentialsRejected(clinicId);
  const second = await t.prisma.calendarConnection.findUnique({
    where: { clinicId },
  });
  assert.deepEqual(
    { ...second, updatedAt: null },
    { ...first, updatedAt: null },
  );
});

test('H18-C45 - listConnectedClinicIds devolve, entre as quatro clínicas, só a CONNECTED', async () => {
  const none = await newClinic();
  const awaiting = await newClinic();
  await seed(awaiting, 'AWAITING_CALENDAR');
  const connected = await newClinic();
  await seed(connected, 'CONNECTED');
  const expired = await newClinic();
  await seed(expired, 'EXPIRED');
  const mine = new Set([none, awaiting, connected, expired]);
  const ids = (await service.listConnectedClinicIds()).filter((id) =>
    mine.has(id),
  );
  assert.deepEqual(ids, [connected]);
});

/** Consumidor como o HACK-19: só importa o módulo e injeta o serviço. */
@Injectable()
class SyncProbe {
  constructor(readonly connections: GoogleCalendarConnectionService) {}
}

test('H18-C46 - enum, clinicId único, cascade e o módulo exporta a porta 3', async () => {
  const values = await t.prisma.$queryRaw<{ value: string }[]>`
    SELECT unnest(enum_range(NULL::"CalendarConnectionStatus"))::text AS value`;
  assert.deepEqual(
    values.map((v) => v.value),
    ['DISCONNECTED', 'AWAITING_CALENDAR', 'CONNECTED', 'EXPIRED'],
  );

  const clinicId = await newClinic();
  await t.prisma.calendarConnection.create({ data: { clinicId } });
  await assert.rejects(
    t.prisma.calendarConnection.create({ data: { clinicId } }),
    (error: unknown) => (error as { code?: string }).code === 'P2002',
  );
  await t.prisma.clinic.delete({ where: { id: clinicId } });
  assert.equal(
    await t.prisma.calendarConnection.count({ where: { clinicId } }),
    0,
  );

  @Module({
    imports: [ConfigModule.forRoot(t.env), PrismaModule, GoogleCalendarModule],
    providers: [SyncProbe],
  })
  class ConsumerModule {}
  const context = await NestFactory.createApplicationContext(ConsumerModule, {
    logger: false,
  });
  try {
    const probe = context.get(SyncProbe);
    assert.ok(probe.connections instanceof GoogleCalendarConnectionService);
    for (const name of [
      'getAuthorizedCalendar',
      'markCredentialsRejected',
      'listConnectedClinicIds',
    ] as const) {
      assert.equal(typeof probe.connections[name], 'function', name);
    }
    assert.equal(typeof isCredentialsRejectedError, 'function');
    assert.deepEqual(
      await probe.connections.listConnectedClinicIds().then(() => 'ok'),
      'ok',
    );
  } finally {
    await context.close();
  }
});
