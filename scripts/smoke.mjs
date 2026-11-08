import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
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
// HACK-16: geocodificador falso (forma do Nominatim); o smoke nunca chama o real.
async function startFakeGeocoder() {
  const server = createHttpServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ lat: '-23.5617', lon: '-46.6560' }]));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}
const geocoder = await startFakeGeocoder();
try {
  const apiPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webPort = await freePort();
  const webUrl = `http://127.0.0.1:${webPort}`;
  // DATABASE_URL e BETTER_AUTH_SECRET vêm do ambiente (CI) ou do .env da API (local).
  // Segredo do operador da demo, novo a cada smoke (HACK-37).
  const demoToken = randomBytes(24).toString('base64url');
  const api = start(['dist/main.js'], 'apps/api', {
    PORT: String(apiPort),
    HOST: '127.0.0.1',
    BETTER_AUTH_URL: apiUrl,
    WEB_ORIGIN: webUrl,
    GEOCODER_URL: `http://127.0.0.1:${geocoder.address().port}`,
    GEOCODER_MIN_INTERVAL_MS: '0',
    DEMO_CLOCK_ENABLED: 'true',
    DEMO_CLOCK_TOKEN: demoToken,
    WHATSAPP_MODE: 'simulated',
    // HACK-18: smoke sem Google configurado (integração indisponível, 503).
    GOOGLE_OAUTH_CLIENT_ID: '',
    GOOGLE_OAUTH_CLIENT_SECRET: '',
    GOOGLE_OAUTH_REDIRECT_URI: '',
    GOOGLE_TOKEN_ENCRYPTION_KEY: '',
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
    { API_BASE_URL: apiUrl, DEMO_CLOCK_TOKEN: demoToken },
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

  // C5 (HACK-12 seg): formulário de outro site postando para o cadastro pelo Next.
  const hostileEmail = `smoke-hostil-${Date.now()}-${process.pid}@teste.local`;
  const hostile = await fetch(`${webUrl}/api/sign-up/paciente`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'http://evil.example',
    },
    body: new URLSearchParams({
      name: 'Atacante',
      email: hostileEmail,
      password,
    }).toString(),
  });
  assert.equal(hostile.status, 403, `C5: cadastro hostil ${hostile.status}`);
  assert.deepEqual(hostile.headers.getSetCookie(), [], 'C5: set-cookie');
  const hostileSignIn = await postJson(
    `${webUrl}/api/auth/sign-in/email`,
    { email: hostileEmail, password },
    webUrl,
  );
  assert.equal(
    hostileSignIn.status,
    401,
    `C5: a conta hostil existe (login ${hostileSignIn.status})`,
  );

  // HACK-16: cadastro de clínica pelo Next e painel /clinica (SSR).
  const clinicEmail = `smoke-clinica-${Date.now()}-${process.pid}@teste.local`;
  const clinicBody = {
    name: 'Clínica Smoke',
    email: clinicEmail,
    password: 'smoke-senha-1',
    address: 'Av. Paulista, 1000, São Paulo',
    cnes: String(Date.now() % 10_000_000).padStart(7, '0'),
    technicalManager: 'Dra. Smoke, CRM 123456',
    openingHours: [{ weekday: 1, startMinute: 480, endMinute: 1080 }],
  };
  const clinicSignUp = await postJson(
    `${webUrl}/api/sign-up/clinica`,
    clinicBody,
    webUrl,
  );
  assert.equal(
    clinicSignUp.status,
    200,
    `H16-C31: cadastro de clínica pelo Next ${clinicSignUp.status}`,
  );
  const clinicCookie = sessionCookie(clinicSignUp, 'H16-C31 cadastro');
  const panel = await fetch(`${webUrl}/clinica`, {
    headers: { cookie: clinicCookie },
  });
  assert.equal(panel.status, 200, `H16-C31: painel ${panel.status}`);
  const panelHtml = await panel.text();
  for (const expected of [
    clinicBody.name,
    clinicBody.address,
    clinicBody.cnes,
    clinicBody.technicalManager,
    'Fechado',
  ]) {
    assert.ok(panelHtml.includes(expected), `H16-C31: painel sem ${expected}`);
  }
  const anonymousPanel = await fetch(`${webUrl}/clinica`, {
    redirect: 'manual',
  });
  assert.ok(
    [303, 307, 308].includes(anonymousPanel.status),
    `H16-C31: /clinica sem cookie ${anonymousPanel.status}`,
  );
  assert.match(
    anonymousPanel.headers.get('location') ?? '',
    /\/clinica\/login$/,
    'H16-C31: /clinica sem cookie não vai ao login',
  );
  const patientPanel = await fetch(`${webUrl}/clinica`, {
    headers: { cookie },
  });
  const patientHtml = await patientPanel.text();
  assert.ok(
    patientHtml.includes('Esta conta não é de clínica') &&
      patientHtml.includes('Sair'),
    'H16-C31: paciente em /clinica sem o aviso e o Sair',
  );

  // HACK-18: /clinica/agenda sem GOOGLE_* (indisponível), alerta do ?google= e login.
  const agenda = await fetch(`${webUrl}/clinica/agenda`, {
    headers: { cookie: clinicCookie },
  });
  assert.equal(agenda.status, 200, `H18-C6: /clinica/agenda ${agenda.status}`);
  const agendaHtml = await agenda.text();
  assert.ok(
    agendaHtml.includes(
      'Integração com a Google Agenda indisponível neste ambiente',
    ),
    'H18-C6: /clinica/agenda sem o aviso de indisponível',
  );
  assert.ok(
    !agendaHtml.includes('Conectar Google Agenda'),
    'H18-C6: /clinica/agenda indisponível mostra o botão de conectar',
  );
  const denied = await fetch(`${webUrl}/clinica/agenda?google=denied`, {
    headers: { cookie: clinicCookie },
  });
  const deniedHtml = await denied.text();
  assert.match(
    deniedHtml,
    /role="alert"[^>]*>Você não autorizou o acesso à Google Agenda\./,
    'H18-C30: ?google=denied sem o alerta em role="alert"',
  );
  const anonymousAgenda = await fetch(`${webUrl}/clinica/agenda`, {
    redirect: 'manual',
  });
  assert.ok(
    [303, 307, 308].includes(anonymousAgenda.status),
    `H18-C32: /clinica/agenda sem cookie ${anonymousAgenda.status}`,
  );
  assert.match(
    anonymousAgenda.headers.get('location') ?? '',
    /\/clinica\/login$/,
    'H18-C32: /clinica/agenda sem cookie não vai ao login',
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

  // HACK-37: /demo/whatsapp só para o operador; sem credencial, nada do conteúdo.
  const demoUrl = `${webUrl}/demo/whatsapp`;
  const operator = (password) =>
    `Basic ${Buffer.from(`operador:${password}`).toString('base64')}`;
  for (const [label, headers] of [
    ['sem credencial', {}],
    ['senha errada', { authorization: operator(`${demoToken}x`) }],
  ]) {
    const denied = await fetch(demoUrl, { headers });
    assert.equal(denied.status, 401, `C1 HACK-37 ${label}: ${denied.status}`);
    assert.match(
      denied.headers.get('www-authenticate') ?? '',
      /^Basic /,
      `C1 HACK-37 ${label}: sem desafio Basic`,
    );
    const html = await denied.text();
    assert.ok(
      !html.includes('WhatsApp simulado') && !html.includes('wa-chat'),
      `C1 HACK-37 ${label}: a resposta traz conteúdo da tela`,
    );
  }
  const allowed = await fetch(demoUrl, {
    headers: { authorization: operator(demoToken) },
  });
  assert.equal(allowed.status, 200, `C2 HACK-37 operador: ${allowed.status}`);
  const allowedHtml = await allowed.text();
  assert.match(allowedHtml, /WhatsApp simulado/);
  assert.match(allowedHtml, /Nenhuma mensagem ainda|wa-chat/);
  assert.ok(!allowedHtml.includes(demoToken), 'C2 HACK-37: token no HTML');
  const directApi = await fetch(`${apiUrl}/api/demo/whatsapp/messages`);
  assert.equal(directApi.status, 401, 'C3 HACK-37: lista da API sem token');

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
    'Smoke HTTP passou: saúde Next/Nest, cadastro, login e sessão pelo Next, cadastro e painel da clínica, token do socket, /demo/whatsapp só com credencial do operador, fallback e 502 com API desligada.',
  );
} finally {
  await Promise.all(processes.map(stop));
  geocoder.close();
}
