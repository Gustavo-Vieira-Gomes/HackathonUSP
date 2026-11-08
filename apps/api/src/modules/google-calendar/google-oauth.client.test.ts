import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { inspect } from 'node:util';
import { loadEnv } from '../../config/env';
import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_TIMEOUT_MS,
  GoogleApiError,
  GoogleOAuthClient,
  isCredentialsRejectedError,
  translateGoogleError,
} from './google-oauth.client';

/**
 * Adaptador real (`googleapis`) contra um servidor HTTP local: os erros são os que a
 * biblioteca produz de verdade, com a config da requisição (Authorization, corpo).
 */
const env = loadEnv({
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/x',
  BETTER_AUTH_SECRET: 'segredo-de-teste-com-32-caracteres!',
  BETTER_AUTH_URL: 'http://127.0.0.1:3001',
  WEB_ORIGIN: 'http://127.0.0.1:3000',
  GOOGLE_OAUTH_CLIENT_ID: 'cliente-de-teste.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'segredo-do-cliente-que-nao-pode-vazar',
  GOOGLE_OAUTH_REDIRECT_URI:
    'http://127.0.0.1:3000/api/google-calendar/callback',
  GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
});

const ACCESS = 'ya29.access-token-que-nao-pode-vazar';
const REFRESH = '1//refresh-token-que-nao-pode-vazar';
const CODE = '4/code-oauth-que-nao-pode-vazar';
const SECRETS = [ACCESS, REFRESH, CODE, env.GOOGLE_OAUTH_CLIENT_SECRET ?? ''];

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

async function listen(
  handler: Handler,
): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Um servidor por status: 400 (invalid_grant), 401, 403 e 500. */
const statusServers = new Map<number, { server: Server; url: string }>();
const urlFor = (status: number) => statusServers.get(status)?.url ?? '';
/** Nunca responde. */
let hang: { server: Server; url: string };
/** Porta fechada: erro de rede. */
let closedUrl: string;

before(async () => {
  const bodies: Record<number, unknown> = {
    400: {
      error: 'invalid_grant',
      error_description: 'Token has been expired or revoked.',
    },
    401: { error: { code: 401, message: 'Invalid Credentials' } },
    403: { error: { code: 403, message: 'Rate Limit Exceeded' } },
    500: { error: { code: 500, message: 'Backend Error' } },
  };
  for (const [status, body] of Object.entries(bodies)) {
    statusServers.set(
      Number(status),
      await listen((_req, res) => json(res, Number(status), body)),
    );
  }
  hang = await listen(() => undefined);
  const closed = await listen(() => undefined);
  closedUrl = closed.url;
  await new Promise<void>((resolve) => closed.server.close(() => resolve()));
});

after(() => {
  for (const { server } of statusServers.values()) {
    server.closeAllConnections();
    server.close();
  }
  hang.server.closeAllConnections();
  hang.server.close();
});

function clientAt(tokenUrl: string, apiRootUrl: string) {
  return new GoogleOAuthClient(env, { tokenUrl, apiRootUrl: `${apiRootUrl}/` });
}

const fresh = {
  refreshToken: REFRESH,
  accessToken: ACCESS,
  expiryDate: Date.now() + 3_600_000,
};

/** Erro cru do googleapis ao listar agendas num servidor que responde `status`. */
async function rawListError(status: number): Promise<unknown> {
  const client = clientAt(`${urlFor(status)}/token`, urlFor(status));
  const calendar = client.calendarFor(fresh, async () => undefined);
  try {
    await calendar.calendarList.list();
  } catch (error) {
    return error;
  }
  throw new Error('a listagem devia falhar');
}

/** Erro cru da renovação do token (sem access token): invalid_grant do servidor. */
async function rawRefreshError(): Promise<unknown> {
  const client = clientAt(`${urlFor(400)}/token`, urlFor(400));
  const calendar = client.calendarFor(
    { refreshToken: REFRESH },
    async () => undefined,
  );
  try {
    await calendar.calendarList.list();
  } catch (error) {
    return error;
  }
  throw new Error('a renovação devia falhar');
}

async function rawNetworkError(): Promise<unknown> {
  const client = clientAt(`${closedUrl}/token`, closedUrl);
  const calendar = client.calendarFor(fresh, async () => undefined);
  try {
    await calendar.calendarList.list();
  } catch (error) {
    return error;
  }
  throw new Error('a chamada devia falhar');
}

test('H18-C7 - URL de autorização com offline, consent, escopos da porta 6, state e redirect', () => {
  const client = new GoogleOAuthClient(env);
  const state = 'A'.repeat(43);
  const url = new URL(client.buildAuthUrl(state));
  assert.equal(url.host, 'accounts.google.com');
  const q = url.searchParams;
  assert.equal(q.get('access_type'), 'offline');
  assert.equal(q.get('prompt'), 'consent');
  assert.equal(q.get('include_granted_scopes'), 'false');
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('client_id'), env.GOOGLE_OAUTH_CLIENT_ID);
  assert.equal(q.get('redirect_uri'), env.GOOGLE_OAUTH_REDIRECT_URI);
  assert.equal(q.get('state'), state);
  assert.deepEqual(q.get('scope')?.split(' ').sort(), [
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.owned',
  ]);
  assert.equal(GOOGLE_CALENDAR_SCOPES.length, 2);
});

test('H18-C37 - erro real do googleapis vira GoogleApiError sem token, code, segredo nem corpo', async () => {
  const exchange = clientAt(`${urlFor(400)}/token`, urlFor(400));
  const exchangeError = await exchange.exchangeCode(CODE).then(
    () => assert.fail('a troca devia falhar'),
    (error: unknown) => error,
  );
  const cases: [string, unknown, string][] = [
    ['invalid_grant na troca', exchangeError, 'credentials_rejected'],
    [
      '401',
      translateGoogleError(await rawListError(401)),
      'credentials_rejected',
    ],
    ['500', translateGoogleError(await rawListError(500)), 'unavailable'],
    ['403', translateGoogleError(await rawListError(403)), 'unavailable'],
    ['rede', translateGoogleError(await rawNetworkError()), 'unavailable'],
  ];
  // controle: o erro cru carrega a config e a resposta da requisição (o gaxios já
  // mascara o Authorization por padrão); o traduzido não carrega nenhuma das duas.
  const raw = await rawListError(401);
  assert.ok(typeof raw === 'object' && raw !== null);
  assert.ok(
    'config' in raw && 'response' in raw,
    'o erro cru devia ter config',
  );
  for (const [label, error, kind] of cases) {
    assert.ok(error instanceof GoogleApiError, label);
    assert.equal('config' in error || 'response' in error, false, label);
    assert.equal(error.kind, kind, label);
    const text = `${JSON.stringify(error)} ${String(error)} ${inspect(error, { depth: 6 })}`;
    for (const secret of SECRETS) {
      assert.equal(text.includes(secret), false, `${label} vazou`);
    }
    assert.equal(
      /Bearer|authorization/i.test(text),
      false,
      `${label} vazou header`,
    );
  }
});

test('H18-C39 - exchangeCode, listOwnedCalendars e calendarFor desistem em 10 s contra servidor que não responde', async () => {
  assert.equal(GOOGLE_TIMEOUT_MS, 10_000);
  const client = clientAt(`${hang.url}/token`, hang.url);
  const timed = async (call: () => Promise<unknown>) => {
    const start = Date.now();
    const error = await call().then(
      () => assert.fail('devia expirar'),
      (e: unknown) => e,
    );
    return { error, ms: Date.now() - start };
  };
  const results = await Promise.all([
    timed(() => client.exchangeCode(CODE)),
    timed(() => client.listOwnedCalendars(fresh)),
    timed(() =>
      client.calendarFor(fresh, async () => undefined).calendarList.list(),
    ),
  ]);
  for (const [index, { error, ms }] of results.entries()) {
    assert.ok(ms >= 10_000 && ms < 12_000, `chamada ${index}: ${ms} ms`);
    assert.equal(
      translateGoogleError(error).kind,
      'timeout',
      `chamada ${index}`,
    );
  }
});

test('H18-C43 - isCredentialsRejectedError: invalid_grant e 401 são true; 403, 500, rede, timeout e não-erros são false', async () => {
  const timeout = await clientAt(`${hang.url}/token`, hang.url)
    .calendarFor(fresh, async () => undefined)
    .calendarList.list()
    .then(
      () => assert.fail('devia expirar'),
      (e: unknown) => e,
    );
  const table: [string, unknown, boolean][] = [
    ['invalid_grant', await rawRefreshError(), true],
    ['401', await rawListError(401), true],
    ['403', await rawListError(403), false],
    ['500', await rawListError(500), false],
    ['rede', await rawNetworkError(), false],
    ['timeout', timeout, false],
    ['Error comum', new Error('invalid_grant'), false],
    ['null', null, false],
    ['string', 'invalid_grant', false],
  ];
  assert.equal(table.length, 9);
  for (const [label, error, expected] of table) {
    assert.equal(isCredentialsRejectedError(error), expected, label);
  }
});
