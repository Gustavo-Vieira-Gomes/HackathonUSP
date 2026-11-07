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
try {
  const apiPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const api = start(['dist/main.js'], 'apps/api', {
    PORT: String(apiPort),
    HOST: '127.0.0.1',
  });
  const apiResponse = await ready(`${apiUrl}/api/health`, api);
  assert.deepEqual(await apiResponse.json(), { status: 'ok', service: 'api' });
  const webPort = await freePort();
  const webUrl = `http://127.0.0.1:${webPort}`;
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
  assert.match(await page.text(), /API conectada/);
  await stop(api.child);
  const offlinePage = await fetch(webUrl);
  assert.equal(offlinePage.status, 200);
  assert.match(await offlinePage.text(), /API indisponível neste momento/);
  console.log(
    'Smoke HTTP passou: saúde Next/Nest, integração e fallback com API desligada.',
  );
} finally {
  await Promise.all(processes.map(stop));
}
