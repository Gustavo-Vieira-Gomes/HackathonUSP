import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, mock, test } from 'node:test';
import {
  googleCalendarConnectionSchema,
  googleCalendarListSchema,
} from '@hackathon/contracts';
import { Logger } from '@nestjs/common';
import {
  jsonRequest,
  sessionCookie,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';
import {
  type GoogleCalendarCandidate,
  GoogleApiError,
  type GoogleCredentials,
  GoogleOAuthClient,
  type ExchangedTokens,
  isCredentialsRejectedError,
} from './google-oauth.client';
import { decryptToken } from './token-cipher';

/**
 * HACK-18 pelo HTTP: API real (guard, pipe, controller, serviço, Postgres do
 * worktree) com o `GoogleOAuthClient` da instância trocado por um falso. Nenhuma
 * prova chama o Google.
 */

const GOOGLE_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: 'cliente-de-teste.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'segredo-do-cliente-de-teste',
  GOOGLE_OAUTH_REDIRECT_URI:
    'http://127.0.0.1:3000/api/google-calendar/callback',
  GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
};
const KEY = Buffer.from(GOOGLE_ENV.GOOGLE_TOKEN_ENCRYPTION_KEY, 'base64');
const BASE = '/api/clinic/google-calendar';
const TOKEN_FORMAT =
  /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/;

interface Fake {
  lastState: string;
  exchangeCalls: string[];
  listCalls: number;
  calendarForCalls: number;
  exchange: (code: string) => Promise<ExchangedTokens>;
  list: (credentials: GoogleCredentials) => Promise<GoogleCalendarCandidate[]>;
  calendarFor: (credentials: GoogleCredentials) => unknown;
  reset(): void;
}

const OWNED: GoogleCalendarCandidate[] = [
  {
    id: 'exames@group.calendar.google.com',
    name: 'Exames',
    primary: false,
    accessRole: 'owner',
  },
  {
    id: 'compartilhada@group.calendar.google.com',
    name: 'Compartilhada',
    primary: false,
    accessRole: 'writer',
  },
  {
    id: 'clinica@exemplo.com',
    name: 'Agenda principal',
    primary: true,
    accessRole: 'owner',
  },
  {
    id: 'feriados@group.v.calendar.google.com',
    name: 'Feriados',
    primary: false,
    accessRole: 'reader',
  },
  {
    id: 'livre-ocupado@exemplo.com',
    name: 'Livre/ocupado',
    primary: false,
    accessRole: 'freeBusyReader',
  },
  {
    id: 'resultados@group.calendar.google.com',
    name: 'Resultados',
    primary: false,
    accessRole: 'owner',
  },
];

function newTokens() {
  return {
    refreshToken: `1//refresh-${randomUUID()}`,
    accessToken: `ya29.access-${randomUUID()}`,
    expiryDate: Date.now() + 3_600_000,
  };
}

/** Último trio de tokens devolvido pelo `exchange` padrão. */
let lastIssued = newTokens();

function installFake(t: TestApp): Fake {
  const client = t.app.get(GoogleOAuthClient);
  const fake: Fake = {
    lastState: '',
    exchangeCalls: [],
    listCalls: 0,
    calendarForCalls: 0,
    exchange: async () => lastIssued,
    list: async () => OWNED,
    calendarFor: () => ({ fake: true }),
    reset() {
      this.exchangeCalls = [];
      this.listCalls = 0;
      this.calendarForCalls = 0;
      this.exchange = async () => {
        lastIssued = newTokens();
        return lastIssued;
      };
      this.list = async () => OWNED;
      this.calendarFor = () => ({ fake: true });
    },
  };
  fake.reset();
  mock.method(client, 'buildAuthUrl', (state: string) => {
    fake.lastState = state;
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`;
  });
  mock.method(client, 'exchangeCode', async (code: string) => {
    fake.exchangeCalls.push(code);
    return fake.exchange(code);
  });
  mock.method(
    client,
    'listOwnedCalendars',
    async (credentials: GoogleCredentials) => {
      fake.listCalls++;
      return fake.list(credentials);
    },
  );
  mock.method(client, 'calendarFor', (credentials: GoogleCredentials) => {
    fake.calendarForCalls++;
    return fake.calendarFor(credentials);
  });
  return fake;
}

let t: TestApp;
let off: TestApp;
let fake: Fake;

type Account = Awaited<ReturnType<typeof signUpWithCookie>>;

before(async () => {
  t = await startTestApp(GOOGLE_ENV);
  off = await startTestApp();
  fake = installFake(t);
});

after(async () => {
  mock.restoreAll();
  await t.close();
  await off.close();
});

function call(
  app: TestApp,
  method: string,
  path: string,
  cookie?: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${app.url}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      origin: app.env.WEB_ORIGIN,
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function clinic(
  app: TestApp = t,
): Promise<Account & { clinicId: string }> {
  const account = await signUpWithCookie(app, 'clinica');
  assert.ok(account.clinicId);
  return { ...account, clinicId: account.clinicId };
}

async function connect(account: Account): Promise<string> {
  const response = await call(t, 'POST', `${BASE}/connect`, account.cookie);
  assert.equal(response.status, 200, await response.clone().text());
  return fake.lastState;
}

function callback(
  account: Account,
  query: Record<string, string>,
): Promise<Response> {
  const search = new URLSearchParams(query).toString();
  return call(t, 'GET', `${BASE}/callback?${search}`, account.cookie);
}

function resultOf(response: Response): string | null {
  assert.equal(response.status, 302);
  const location = response.headers.get('location') ?? '';
  const url = new URL(location);
  assert.equal(url.origin, new URL(t.env.WEB_ORIGIN).origin);
  assert.equal(url.pathname, '/clinica/agenda');
  return url.searchParams.get('google');
}

async function row(clinicId: string) {
  return t.prisma.calendarConnection.findUnique({ where: { clinicId } });
}

/** Clínica autorizada (AWAITING_CALENDAR) pelo fluxo real com o falso. */
async function authorized(account: Account) {
  const state = await connect(account);
  const result = resultOf(
    await callback(account, { code: `4/code-${randomUUID()}`, state }),
  );
  assert.equal(result, 'awaiting_calendar');
  return lastIssued;
}

/** Clínica CONNECTED com a agenda "Exames". */
async function connected(account: Account) {
  const tokens = await authorized(account);
  const response = await call(t, 'PUT', `${BASE}/calendar`, account.cookie, {
    calendarId: OWNED[0]?.id,
  });
  assert.equal(response.status, 200, await response.clone().text());
  return tokens;
}

/** Estado comparável da linha (status, tokens, agenda, state). */
async function snapshot(clinicId: string) {
  const r = await row(clinicId);
  return (
    r && {
      status: r.status,
      refreshToken: r.refreshToken,
      accessToken: r.accessToken,
      calendarId: r.calendarId,
      calendarName: r.calendarName,
      oauthStateHash: r.oauthStateHash,
    }
  );
}

const ROUTES: [string, string, unknown?][] = [
  ['GET', BASE],
  ['POST', `${BASE}/connect`],
  ['GET', `${BASE}/callback?code=x&state=y`],
  ['GET', `${BASE}/calendars`],
  ['PUT', `${BASE}/calendar`, { calendarId: 'qualquer' }],
];

// ---- S1 ----

test('H18-C5 - sem GOOGLE_* a API sobe e as 5 rotas respondem 503 GOOGLE_CALENDAR_UNAVAILABLE à clínica', async () => {
  const health = await fetch(`${off.url}/api/health`);
  assert.equal(health.status, 200);
  const account = await clinic(off);
  const offClient = off.app.get(GoogleOAuthClient);
  const spies = (
    [
      'buildAuthUrl',
      'exchangeCode',
      'listOwnedCalendars',
      'calendarFor',
    ] as const
  ).map((name) =>
    mock.method(offClient, name, () =>
      assert.fail('o Google não devia ser chamado'),
    ),
  );
  for (const [method, path, body] of ROUTES) {
    const response = await call(off, method, path, account.cookie, body);
    assert.equal(response.status, 503, `${method} ${path}`);
    const json = (await response.json()) as { code: string; message: string };
    assert.equal(json.code, 'GOOGLE_CALENDAR_UNAVAILABLE');
    assert.ok(json.message.length > 0);
  }
  for (const spy of spies) {
    assert.equal(spy.mock.callCount(), 0);
    spy.mock.restore();
  }
});

// ---- S2 ----

test('H18-C8 - connect devolve authorizationUrl e grava só o SHA-256 do state, a sessão e 10 min', async () => {
  const account = await clinic();
  const before = Date.now();
  const response = await call(t, 'POST', `${BASE}/connect`, account.cookie);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { authorizationUrl: string };
  assert.ok(body.authorizationUrl.startsWith('https://accounts.google.com/'));
  const state = fake.lastState;
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  const r = await row(account.clinicId);
  assert.ok(r);
  const hash = createHash('sha256').update(state).digest('hex');
  assert.equal(r.oauthStateHash, hash);
  assert.notEqual(r.oauthStateHash, state);
  const session = await t.sessions.getSession(
    new Headers({ cookie: account.cookie }),
  );
  assert.equal(r.oauthStateSessionId, session?.session.id);
  const expires = r.oauthStateExpiresAt?.getTime() ?? 0;
  assert.ok(
    expires >= before + 595_000 && expires <= Date.now() + 605_000,
    `${expires - before}`,
  );

  await connect(account);
  assert.notEqual(fake.lastState, state);
  const again = await row(account.clinicId);
  assert.equal(
    again?.oauthStateHash,
    createHash('sha256').update(fake.lastState).digest('hex'),
  );
});

test('H18-C9 - sem cookie 401 e com sessão de paciente 403 nas 5 rotas, sem Google nem linha', async () => {
  fake.reset();
  const patient = await signUpWithCookie(t, 'paciente');
  const before = await t.prisma.calendarConnection.count();
  for (const [method, path, body] of ROUTES) {
    const anonymous = await call(t, method, path, undefined, body);
    assert.equal(anonymous.status, 401, `${method} ${path} sem cookie`);
    const asPatient = await call(t, method, path, patient.cookie, body);
    assert.equal(asPatient.status, 403, `${method} ${path} paciente`);
  }
  assert.equal(fake.exchangeCalls.length + fake.listCalls, 0);
  assert.equal(await t.prisma.calendarConnection.count(), before);
});

test('H18-C10 - callback válido grava tokens cifrados, AWAITING_CALENDAR, zera o state e redireciona', async () => {
  fake.reset();
  const account = await clinic();
  const state = await connect(account);
  const code = `4/code-${randomUUID()}`;
  const response = await callback(account, { code, state });
  assert.equal(
    response.headers.get('location'),
    `${new URL('/clinica/agenda', t.env.WEB_ORIGIN).toString()}?google=awaiting_calendar`,
  );
  assert.equal(resultOf(response), 'awaiting_calendar');
  assert.deepEqual(fake.exchangeCalls, [code]);
  const r = await row(account.clinicId);
  assert.ok(r?.refreshToken && r.accessToken);
  assert.equal(r.status, 'AWAITING_CALENDAR');
  assert.match(r.refreshToken, TOKEN_FORMAT);
  assert.match(r.accessToken, TOKEN_FORMAT);
  assert.equal(
    decryptToken(KEY, account.clinicId, r.refreshToken),
    lastIssued.refreshToken,
  );
  assert.equal(
    decryptToken(KEY, account.clinicId, r.accessToken),
    lastIssued.accessToken,
  );
  assert.equal(r.oauthStateHash, null);
  assert.equal(r.oauthStateSessionId, null);
  assert.equal(r.oauthStateExpiresAt, null);
});

test('H18-C11 - state ausente, desconhecido, vencido, consumido ou de outra sessão: invalid_state sem troca nem mudança', async () => {
  fake.reset();
  const account = await clinic();
  await connected(account);

  // consumido: um callback que deu certo, depois o mesmo state de novo
  const consumedState = await connect(account);
  assert.equal(
    resultOf(await callback(account, { code: 'c1', state: consumedState })),
    'awaiting_calendar',
  );
  await call(t, 'PUT', `${BASE}/calendar`, account.cookie, {
    calendarId: OWNED[0]?.id,
  });

  // outra sessão da mesma conta
  const signIn = await jsonRequest(t, 'POST', '/api/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  const otherSession = { ...account, cookie: sessionCookie(signIn) };

  const cases: [string, () => Promise<Record<string, string>>, Account][] = [
    ['sem state', async () => ({ code: 'c' }), account],
    [
      'desconhecido',
      async () => ({ code: 'c', state: 'x'.repeat(43) }),
      account,
    ],
    [
      'vencido',
      async () => {
        const state = await connect(account);
        await t.prisma.calendarConnection.update({
          where: { clinicId: account.clinicId },
          data: { oauthStateExpiresAt: new Date(Date.now() - 1000) },
        });
        return { code: 'c', state };
      },
      account,
    ],
    ['consumido', async () => ({ code: 'c', state: consumedState }), account],
    [
      'outra sessão',
      async () => ({ code: 'c', state: await connect(account) }),
      otherSession,
    ],
  ];
  for (const [label, prepare, who] of cases) {
    const query = await prepare();
    const before = await snapshot(account.clinicId);
    fake.exchangeCalls = [];
    const result = resultOf(await callback(who, query));
    assert.equal(result, 'invalid_state', label);
    assert.equal(fake.exchangeCalls.length, 0, label);
    const now = await snapshot(account.clinicId);
    assert.equal(now?.status, 'CONNECTED', label);
    assert.deepEqual(
      { ...now, oauthStateHash: null },
      { ...before, oauthStateHash: null },
      label,
    );
  }
});

test('H18-C12 - state da Clínica A com a sessão da Clínica B: invalid_state e as duas como estavam', async () => {
  fake.reset();
  const a = await clinic();
  const b = await clinic();
  const state = await connect(a);
  const beforeA = await snapshot(a.clinicId);
  const result = resultOf(await callback(b, { code: 'c', state }));
  assert.equal(result, 'invalid_state');
  assert.equal(fake.exchangeCalls.length, 0);
  assert.deepEqual(await snapshot(a.clinicId), beforeA);
  assert.ok(beforeA?.oauthStateHash);
  assert.equal(await row(b.clinicId), null);
});

test('H18-C13 - dois callbacks simultâneos com o mesmo state: uma troca, um awaiting_calendar e um invalid_state', async () => {
  fake.reset();
  const account = await clinic();
  const state = await connect(account);
  // A troca falsa fica presa até o outro pedido terminar no serviço: quem consumiu
  // o state espera na troca; o outro precisa sair sem trocar. Se os dois trocassem,
  // ninguém liberaria e o teste estouraria o tempo (falha), sem sleep.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const service = t.app.get(GoogleCalendarConnectionService);
  const original = service.completeCallback.bind(service);
  const spy = mock.method(
    service,
    'completeCallback',
    async (...args: Parameters<typeof original>) => {
      const result = await original(...args);
      if (result === 'invalid_state') release();
      return result;
    },
  );
  fake.exchange = async () => {
    await gate;
    lastIssued = newTokens();
    return lastIssued;
  };
  const [first, second] = await Promise.all([
    callback(account, { code: 'c-1', state }),
    callback(account, { code: 'c-2', state }),
  ]);
  spy.mock.restore();
  const results = [resultOf(first), resultOf(second)].sort();
  assert.deepEqual(results, ['awaiting_calendar', 'invalid_state']);
  assert.equal(fake.exchangeCalls.length, 1);
  const r = await row(account.clinicId);
  assert.equal(r?.status, 'AWAITING_CALENDAR');
  assert.equal(
    decryptToken(KEY, account.clinicId, r?.refreshToken ?? ''),
    lastIssued.refreshToken,
  );
});

test('H18-C14 - error=access_denied com state válido: denied, state zerado, conexão intacta', async () => {
  fake.reset();
  const account = await clinic();
  await connected(account);
  const state = await connect(account);
  const before = await snapshot(account.clinicId);
  fake.exchangeCalls = [];
  const result = resultOf(
    await callback(account, { error: 'access_denied', state }),
  );
  assert.equal(result, 'denied');
  assert.equal(fake.exchangeCalls.length, 0);
  assert.deepEqual(await snapshot(account.clinicId), {
    ...before,
    oauthStateHash: null,
  });
  assert.equal(before?.status, 'CONNECTED');
});

test('H18-C15 - troca sem refresh token: no_refresh_token e nenhum token gravado', async () => {
  fake.reset();
  const account = await clinic();
  await connected(account);
  const state = await connect(account);
  const before = await snapshot(account.clinicId);
  fake.exchange = async () => ({
    accessToken: 'ya29.so-access',
    expiryDate: Date.now() + 1000,
  });
  const result = resultOf(await callback(account, { code: 'c', state }));
  assert.equal(result, 'no_refresh_token');
  assert.deepEqual(await snapshot(account.clinicId), {
    ...before,
    oauthStateHash: null,
  });
});

test('H18-C16 - troca que falha ou expira: google_unavailable e nenhum token gravado', async () => {
  for (const kind of ['unavailable', 'timeout'] as const) {
    fake.reset();
    const account = await clinic();
    const state = await connect(account);
    const before = await snapshot(account.clinicId);
    fake.exchange = async () => {
      throw new GoogleApiError(kind, kind === 'unavailable' ? 500 : undefined);
    };
    const result = resultOf(await callback(account, { code: 'c', state }));
    assert.equal(result, 'google_unavailable', kind);
    const now = await snapshot(account.clinicId);
    assert.deepEqual(now, { ...before, oauthStateHash: null }, kind);
    assert.equal(now?.refreshToken, null, kind);
  }
});

test('H18-C17 - reconectar mantém a conexão até o callback dar certo, aí troca os tokens e volta a AWAITING_CALENDAR', async () => {
  fake.reset();
  const account = await clinic();
  const old = await connected(account);
  const response = await call(t, 'POST', `${BASE}/connect`, account.cookie);
  assert.equal(response.status, 200);
  const mid = await row(account.clinicId);
  assert.equal(mid?.status, 'CONNECTED');
  assert.equal(
    decryptToken(KEY, account.clinicId, mid?.refreshToken ?? ''),
    old.refreshToken,
  );
  assert.equal(mid?.calendarId, OWNED[0]?.id);

  const result = resultOf(
    await callback(account, { code: 'novo', state: fake.lastState }),
  );
  assert.equal(result, 'awaiting_calendar');
  const r = await row(account.clinicId);
  assert.equal(r?.status, 'AWAITING_CALENDAR');
  assert.equal(
    decryptToken(KEY, account.clinicId, r?.refreshToken ?? ''),
    lastIssued.refreshToken,
  );
  assert.equal(
    decryptToken(KEY, account.clinicId, r?.accessToken ?? ''),
    lastIssued.accessToken,
  );
  assert.notEqual(lastIssued.refreshToken, old.refreshToken);
});

// ---- S3 ----

test('H18-C20 - calendars em AWAITING_CALENDAR e CONNECTED: só owner, id/name/primary, primária primeiro', async () => {
  fake.reset();
  const account = await clinic();
  await authorized(account);
  const expected = [
    { id: 'clinica@exemplo.com', name: 'Agenda principal', primary: true },
    { id: 'exames@group.calendar.google.com', name: 'Exames', primary: false },
    {
      id: 'resultados@group.calendar.google.com',
      name: 'Resultados',
      primary: false,
    },
  ];
  for (const status of ['AWAITING_CALENDAR', 'CONNECTED']) {
    if (status === 'CONNECTED') {
      await call(t, 'PUT', `${BASE}/calendar`, account.cookie, {
        calendarId: OWNED[0]?.id,
      });
      assert.equal((await row(account.clinicId))?.status, 'CONNECTED');
    }
    const response = await call(t, 'GET', `${BASE}/calendars`, account.cookie);
    assert.equal(response.status, 200, status);
    const body = googleCalendarListSchema.parse(await response.json());
    assert.deepEqual(body.calendars, expected, status);
    for (const item of body.calendars) {
      assert.deepEqual(Object.keys(item).sort(), ['id', 'name', 'primary']);
    }
  }
});

test('H18-C21 - calendars e PUT sem linha ou EXPIRED: 409 CALENDAR_NOT_AUTHORIZED sem Google', async () => {
  fake.reset();
  const none = await clinic();
  const expired = await clinic();
  await connected(expired);
  await t.app
    .get(GoogleCalendarConnectionService)
    .markCredentialsRejected(expired.clinicId);
  fake.listCalls = 0;
  for (const account of [none, expired]) {
    const before = await snapshot(account.clinicId);
    for (const [method, path, body] of [
      ['GET', `${BASE}/calendars`, undefined],
      ['PUT', `${BASE}/calendar`, { calendarId: OWNED[0]?.id }],
    ] as const) {
      const response = await call(t, method, path, account.cookie, body);
      assert.equal(response.status, 409, `${method} ${path}`);
      const json = (await response.json()) as { code: string };
      assert.equal(json.code, 'CALENDAR_NOT_AUTHORIZED');
    }
    assert.deepEqual(await snapshot(account.clinicId), before);
  }
  assert.equal(fake.listCalls, 0);
});

test('H18-C22 - PUT com agenda própria: 200 connected com calendarName e connectedAt; linha CONNECTED', async () => {
  fake.reset();
  const account = await clinic();
  await authorized(account);
  const response = await call(t, 'PUT', `${BASE}/calendar`, account.cookie, {
    calendarId: 'resultados@group.calendar.google.com',
  });
  assert.equal(response.status, 200);
  const body = googleCalendarConnectionSchema.parse(await response.json());
  assert.equal(body.status, 'connected');
  assert.equal(body.calendarName, 'Resultados');
  assert.ok(body.connectedAt);
  const r = await row(account.clinicId);
  assert.equal(r?.status, 'CONNECTED');
  assert.equal(r?.calendarId, 'resultados@group.calendar.google.com');
  assert.equal(r?.calendarName, 'Resultados');
});

test('H18-C23 - PUT: agenda fora da lista ou writer 422 CALENDAR_NOT_AVAILABLE; corpo inválido 422 VALIDATION_FAILED', async () => {
  fake.reset();
  const account = await clinic();
  await authorized(account);
  const before = await snapshot(account.clinicId);
  for (const calendarId of [
    'nao-existe@exemplo.com',
    'compartilhada@group.calendar.google.com',
  ]) {
    const response = await call(t, 'PUT', `${BASE}/calendar`, account.cookie, {
      calendarId,
    });
    assert.equal(response.status, 422, calendarId);
    const json = (await response.json()) as { code: string };
    assert.equal(json.code, 'CALENDAR_NOT_AVAILABLE', calendarId);
  }
  fake.listCalls = 0;
  for (const body of [{}, { calendarId: '' }, { calendarId: 123 }]) {
    const response = await call(
      t,
      'PUT',
      `${BASE}/calendar`,
      account.cookie,
      body,
    );
    assert.equal(response.status, 422, JSON.stringify(body));
    const json = (await response.json()) as { code: string; fields: string[] };
    assert.equal(json.code, 'VALIDATION_FAILED');
    assert.deepEqual(json.fields, ['calendarId']);
  }
  assert.equal(fake.listCalls, 0);
  assert.deepEqual(await snapshot(account.clinicId), before);
});

test('H18-C24 - credencial recusada ao listar (invalid_grant, 401): 409 e a conexão vira EXPIRED sem tokens', async () => {
  const failures: [string, unknown][] = [
    [
      'invalid_grant',
      { response: { status: 400, data: { error: 'invalid_grant' } } },
    ],
    ['401', new GoogleApiError('credentials_rejected', 401)],
  ];
  for (const [label, failure] of failures) {
    for (const [method, path, body] of [
      ['GET', `${BASE}/calendars`, undefined],
      ['PUT', `${BASE}/calendar`, { calendarId: OWNED[0]?.id }],
    ] as const) {
      fake.reset();
      const account = await clinic();
      await connected(account);
      fake.list = async () => {
        throw failure;
      };
      const response = await call(t, method, path, account.cookie, body);
      assert.equal(response.status, 409, `${label} ${method}`);
      const json = (await response.json()) as { code: string };
      assert.equal(json.code, 'CALENDAR_NOT_AUTHORIZED');
      const r = await row(account.clinicId);
      assert.equal(r?.status, 'EXPIRED', `${label} ${method}`);
      assert.equal(r?.refreshToken, null);
      assert.equal(r?.accessToken, null);
    }
  }
});

test('H18-C25 - outra falha do Google ao listar: 502 GOOGLE_UNAVAILABLE; timeout: 504 GOOGLE_TIMEOUT; conexão intacta', async () => {
  const failures: [GoogleApiError, number, string][] = [
    [new GoogleApiError('unavailable', 500), 502, 'GOOGLE_UNAVAILABLE'],
    [new GoogleApiError('timeout'), 504, 'GOOGLE_TIMEOUT'],
  ];
  fake.reset();
  const account = await clinic();
  await connected(account);
  const before = await snapshot(account.clinicId);
  for (const [failure, status, code] of failures) {
    fake.list = async () => {
      throw failure;
    };
    for (const [method, path, body] of [
      ['GET', `${BASE}/calendars`, undefined],
      ['PUT', `${BASE}/calendar`, { calendarId: OWNED[0]?.id }],
    ] as const) {
      const response = await call(t, method, path, account.cookie, body);
      assert.equal(response.status, status, `${code} ${method}`);
      const json = (await response.json()) as { code: string };
      assert.equal(json.code, code);
      assert.deepEqual(await snapshot(account.clinicId), before);
    }
  }
});

test('H18-C26 - GET de status nos 4 status, dentro do contrato', async () => {
  fake.reset();
  const status = async (account: Account) => {
    const response = await call(t, 'GET', BASE, account.cookie);
    assert.equal(response.status, 200);
    return googleCalendarConnectionSchema.parse(await response.json());
  };
  const none = await clinic();
  assert.deepEqual(await status(none), { status: 'disconnected' });
  const awaiting = await clinic();
  await authorized(awaiting);
  assert.deepEqual(await status(awaiting), { status: 'awaiting_calendar' });
  const conn = await clinic();
  await connected(conn);
  const body = await status(conn);
  assert.equal(body.status, 'connected');
  assert.equal(body.calendarName, 'Exames');
  assert.ok(body.connectedAt);
  const exp = await clinic();
  await connected(exp);
  await t.app
    .get(GoogleCalendarConnectionService)
    .markCredentialsRejected(exp.clinicId);
  assert.equal((await status(exp)).status, 'expired');
});

// ---- S4 ----

test('H18-C33 - nenhum corpo nem Location do fluxo carrega token, code ou state', async () => {
  fake.reset();
  const account = await clinic();
  const seen: { label: string; text: string; stateAllowed: boolean }[] = [];
  const record = async (
    label: string,
    response: Response,
    stateAllowed = false,
  ) => {
    seen.push({
      label,
      text: `${await response.clone().text()} ${response.headers.get('location') ?? ''}`,
      stateAllowed,
    });
    return response;
  };
  const codes: string[] = [];
  const states: string[] = [];
  // connect: o state vai ao navegador dentro da authorizationUrl (é o canal dele no OAuth)
  await record(
    'connect',
    await call(t, 'POST', `${BASE}/connect`, account.cookie),
    true,
  );
  states.push(fake.lastState);
  const code = `4/code-${randomUUID()}`;
  codes.push(code);
  await record(
    'callback',
    await callback(account, { code, state: fake.lastState }),
  );
  const issued = lastIssued;
  await record(
    'calendars',
    await call(t, 'GET', `${BASE}/calendars`, account.cookie),
  );
  await record(
    'put',
    await call(t, 'PUT', `${BASE}/calendar`, account.cookie, {
      calendarId: OWNED[0]?.id,
    }),
  );
  await record('status', await call(t, 'GET', BASE, account.cookie));
  // callbacks de erro
  await record(
    'invalid_state',
    await callback(account, { code: 'c-x', state: 'y'.repeat(43) }),
  );
  codes.push('c-x');
  states.push('y'.repeat(43));
  await call(t, 'POST', `${BASE}/connect`, account.cookie);
  states.push(fake.lastState);
  await record(
    'denied',
    await callback(account, { error: 'access_denied', state: fake.lastState }),
  );
  await call(t, 'POST', `${BASE}/connect`, account.cookie);
  states.push(fake.lastState);
  fake.exchange = async () => ({ accessToken: 'ya29.sem-refresh' });
  await record(
    'no_refresh',
    await callback(account, { code: 'c-nr', state: fake.lastState }),
  );
  codes.push('c-nr');
  await call(t, 'POST', `${BASE}/connect`, account.cookie);
  states.push(fake.lastState);
  fake.exchange = async () => {
    throw new GoogleApiError('unavailable', 500);
  };
  await record(
    'unavailable',
    await callback(account, { code: 'c-un', state: fake.lastState }),
  );
  codes.push('c-un');

  const tokens = [issued.refreshToken, issued.accessToken, 'ya29.sem-refresh'];
  for (const { label, text, stateAllowed } of seen) {
    for (const secret of [...tokens, ...codes]) {
      assert.equal(
        text.includes(secret),
        false,
        `${label} vazou token ou code`,
      );
    }
    if (!stateAllowed) {
      for (const state of states) {
        assert.equal(text.includes(state), false, `${label} vazou state`);
      }
    }
  }
  assert.equal(seen.length, 9);
});

test('H18-C34 - colunas cruas: tokens só no formato v1 e nenhum texto puro na linha', async () => {
  fake.reset();
  const account = await clinic();
  const tokens = await connected(account);
  const rows = await t.prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "CalendarConnection" WHERE "clinicId" = ${account.clinicId}::uuid`;
  assert.equal(rows.length, 1);
  const raw = rows[0] ?? {};
  assert.match(String(raw.refreshToken), TOKEN_FORMAT);
  assert.match(String(raw.accessToken), TOKEN_FORMAT);
  const all = JSON.stringify(raw, (_k, v: unknown) =>
    v instanceof Date ? v.toISOString() : v,
  );
  assert.equal(all.includes(tokens.refreshToken), false);
  assert.equal(all.includes(tokens.accessToken), false);
});

test('H18-C36 - logs das falhas do Google sem token, code, state, Bearer nem Authorization', async () => {
  const lines: string[] = [];
  const capture = (...args: unknown[]) => {
    lines.push(
      args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' '),
    );
  };
  const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(
    (level) => mock.method(Logger.prototype, level, capture),
  );
  try {
    fake.reset();
    const account = await clinic();
    const tokens = await connected(account);
    const code = `4/code-${randomUUID()}`;
    const leaky = (status: number, data: unknown) => ({
      message: `Request failed with ${tokens.refreshToken}`,
      config: {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        data: `code=${code}&refresh_token=${tokens.refreshToken}`,
      },
      response: { status, data },
    });
    // C16: falha na troca
    const state = await connect(account);
    fake.exchange = async () => {
      throw leaky(500, { error: 'backend' });
    };
    resultOf(await callback(account, { code, state }));
    // C25: falha ao listar
    fake.list = async () => {
      throw leaky(503, { error: 'unavailable' });
    };
    await call(t, 'GET', `${BASE}/calendars`, account.cookie);
    // C24: credencial recusada ao listar
    fake.list = async () => {
      throw leaky(400, { error: 'invalid_grant' });
    };
    await call(t, 'GET', `${BASE}/calendars`, account.cookie);

    const text = lines.join('\n');
    assert.match(text, /unavailable \(HTTP 500\)/);
    assert.match(text, /unavailable \(HTTP 503\)/);
    assert.match(text, /credentials_rejected \(HTTP 400\)/);
    for (const secret of [
      tokens.refreshToken,
      tokens.accessToken,
      code,
      state,
    ]) {
      assert.equal(text.includes(secret), false, 'log vazou segredo');
    }
    assert.equal(/Bearer|Authorization/i.test(text), false);
  } finally {
    for (const spy of spies) spy.mock.restore();
  }
});

// ---- S5 ----

test('H18-C44 - invalid_grant do cliente, markCredentialsRejected e o GET passa a expired', async () => {
  fake.reset();
  const account = await clinic();
  await connected(account);
  const service = t.app.get(GoogleCalendarConnectionService);
  const revoked = {
    response: { status: 400, data: { error: 'invalid_grant' } },
  };
  fake.calendarFor = () => ({
    events: {
      list: async () => {
        throw revoked;
      },
    },
  });
  const { calendar } = await service.getAuthorizedCalendar(account.clinicId);
  const error = await (
    calendar as unknown as { events: { list(): Promise<unknown> } }
  ).events
    .list()
    .then(
      () => assert.fail('devia falhar'),
      (e: unknown) => e,
    );
  assert.equal(isCredentialsRejectedError(error), true);
  await service.markCredentialsRejected(account.clinicId);
  const response = await call(t, 'GET', BASE, account.cookie);
  assert.equal(
    ((await response.json()) as { status: string }).status,
    'expired',
  );
});
