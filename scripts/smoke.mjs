import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const processes = [];
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
function start(args, cwd, env) {
  let output = '';
  const child = spawn(process.execPath, args, {
    cwd: `${root}${cwd}`,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.on('error', (error) => {
    output += String(error);
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output = (output + chunk).slice(-12000);
    });
  }
  processes.push(child);
  return { child, output: () => output };
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(5000).then(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
  });
  await Promise.race([exited, timer]);
  if (child.exitCode === null && child.signalCode === null) await exited;
}
async function ready(url, process) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (process.child.exitCode !== null) throw new Error(process.output());
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch {
      /* Wait for server readiness, bounded below. */
    }
    await setTimeout(250);
  }
  throw new Error(`Servidor não iniciou: ${url}\n${process.output()}`);
}
function sessionCookie(response, label) {
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .find((pair) => pair.includes('session_token='));
  assert.ok(cookie, `${label}: resposta sem cookie de sessão`);
  return cookie;
}
async function postJson(url, body, origin) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}
try {
  const apiPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webPort = await freePort();
  const webUrl = `http://127.0.0.1:${webPort}`;
  // DATABASE_URL e BETTER_AUTH_SECRET vêm do ambiente (CI) ou do .env da API (local).
  const api = start(['dist/main.js'], 'apps/api', {
    PORT: String(apiPort),
    HOST: '127.0.0.1',
    BETTER_AUTH_URL: apiUrl,
    WEB_ORIGIN: webUrl,
  });
  const apiResponse = await ready(`${apiUrl}/api/health`, api);
  assert.deepEqual(await apiResponse.json(), { status: 'ok', service: 'api' });
  const web = start(
    [
      require.resolve('next/dist/bin/next'),
      'start',
      '-p',
      String(webPort),
      '-H',
      '127.0.0.1',
    ],
    'apps/web',
    { API_BASE_URL: apiUrl },
  );
  const webResponse = await ready(`${webUrl}/api/health`, web);
  assert.deepEqual(await webResponse.json(), { status: 'ok', service: 'web' });
  const page = await fetch(webUrl);
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert.match(pageHtml, /API conectada/);
  assert.match(pageHtml, /Sem sessão ativa/);

  const email = `smoke-${Date.now()}-${process.pid}@teste.local`;
  const password = 'smoke-senha-1';
  const signUp = await postJson(
    `${webUrl}/api/sign-up/paciente`,
    { name: 'Smoke', email, password },
    webUrl,
  );
  assert.equal(signUp.status, 200, `C29: cadastro pelo Next ${signUp.status}`);
  sessionCookie(signUp, 'C29 cadastro');
  const signIn = await postJson(
    `${webUrl}/api/auth/sign-in/email`,
    { email, password },
    webUrl,
  );
  assert.equal(signIn.status, 200, `C29: login pelo Next ${signIn.status}`);
  const cookie = sessionCookie(signIn, 'C29 login');
  const sessionPage = await fetch(webUrl, { headers: { cookie } });
  assert.equal(sessionPage.status, 200);
  assert.ok(
    (await sessionPage.text()).includes(`Sessão ativa: ${email}`),
    'C31: a página com o cookie do login não mostra o e-mail da sessão',
  );

  // HACK-38: token de uso único do socket pelo repasse /api/auth/* do Next.
  const generateUrl = `${webUrl}/api/auth/one-time-token/generate`;
  const generated = await fetch(generateUrl, { headers: { cookie } });
  assert.equal(
    generated.status,
    200,
    `C1: generate com cookie ${generated.status}`,
  );
  const { token } = await generated.json();
  assert.ok(
    typeof token === 'string' && token.length > 0,
    'C1: generate sem token',
  );
  const anonymous = await fetch(generateUrl);
  assert.equal(
    anonymous.status,
    401,
    `C1: generate sem cookie ${anonymous.status}`,
  );
  assert.ok(!(await anonymous.text()).includes('"token"'), 'C1: 401 com token');
  const signOut = await fetch(`${webUrl}/api/auth/sign-out`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webUrl, cookie },
    body: '{}',
  });
  assert.equal(signOut.status, 200, `C1: sign-out pelo Next ${signOut.status}`);
  const afterSignOut = await fetch(generateUrl, { headers: { cookie } });
  assert.equal(
    afterSignOut.status,
    401,
    `C1: generate com sessão encerrada ${afterSignOut.status}`,
  );

  await stop(api.child);
  const offlinePage = await fetch(webUrl);
  assert.equal(offlinePage.status, 200);
  assert.match(await offlinePage.text(), /API indisponível neste momento/);
  const offlineSignIn = await postJson(
    `${webUrl}/api/auth/sign-in/email`,
    { email, password },
    webUrl,
  );
  assert.equal(offlineSignIn.status, 502, 'C32: repasse com a API desligada');
  console.log(
    'Smoke HTTP passou: saúde Next/Nest, cadastro, login e sessão pelo Next, token do socket, fallback e 502 com API desligada.',
  );
} finally {
  await Promise.all(processes.map(stop));
}
