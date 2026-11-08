import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { GET } from '../../../app/api/google-calendar/callback/route';
import { API_PROXY_TIMEOUT_MS } from '../../shared/services/api-proxy.service';
import {
  closedPortUrl,
  startFakeApi,
} from '../../shared/services/fake-api.test-helper';

const COOKIE = 'better-auth.session_token=abc.def';
const NEST_LOCATION =
  'http://127.0.0.1:3000/clinica/agenda?google=awaiting_calendar';
const QUERY = '?code=4%2Fcodigo&state=estado-43&error=access_denied';

let api: Awaited<ReturnType<typeof startFakeApi>>;
before(async () => {
  api = await startFakeApi((request) =>
    request.url.startsWith('/api/clinic/google-calendar/callback')
      ? { status: 302, headers: { location: NEST_LOCATION } }
      : { status: 404 },
  );
});
after(() => api.close());

function browser(cookie?: string): Request {
  return new Request(
    `http://127.0.0.1:3000/api/google-calendar/callback${QUERY}`,
    { headers: cookie ? { cookie } : {} },
  );
}

test('H18-C18 - callback do Next: repassa query e cookie e devolve o 302 do Nest; sem sessão vai ao login; 502 e 504', async () => {
  // com cookie: repasse
  process.env.API_BASE_URL = api.url;
  const response = await GET(browser(COOKIE));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), NEST_LOCATION);
  const forwarded = api.requests.at(-1);
  assert.equal(forwarded?.url, `/api/clinic/google-calendar/callback${QUERY}`);
  assert.equal(forwarded?.headers.cookie, COOKIE);

  // sem cookie de sessão: login, sem chamar a API
  const before = api.requests.length;
  const anonymous = await GET(browser('outro=1'));
  assert.equal(anonymous.status, 302);
  assert.equal(
    new URL(anonymous.headers.get('location') ?? '').pathname,
    '/clinica/login',
  );
  assert.equal(api.requests.length, before);

  // API fora do ar
  process.env.API_BASE_URL = await closedPortUrl();
  assert.equal((await GET(browser(COOKIE))).status, 502);

  // API que não responde
  const stuck = await startFakeApi(() => null);
  process.env.API_BASE_URL = stuck.url;
  const start = Date.now();
  const timedOut = await GET(browser(COOKIE));
  assert.equal(timedOut.status, 504);
  assert.ok(Date.now() - start >= API_PROXY_TIMEOUT_MS - 50);
  await stuck.close();
});
