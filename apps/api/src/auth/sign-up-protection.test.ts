import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { UserRole } from '@hackathon/contracts';
import {
  clinicSignUpBody,
  startTestApp,
  type TestApp,
} from '../testing/test-app';
import { SIGN_UP_RATE_LIMIT } from './sign-up-protection';

let t: TestApp;
before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.close();
});

const roles: UserRole[] = ['paciente', 'clinica'];
const countByEmail = (app: TestApp, email: string) =>
  app.prisma.user.count({ where: { email } });

function post(
  app: TestApp,
  role: UserRole,
  body: string,
  headers: Record<string, string>,
): Promise<Response> {
  return fetch(`${app.url}/api/sign-up/${role}`, {
    method: 'POST',
    headers,
    body,
  });
}

/** Corpo JSON válido da rota: a de clínica exige o perfil completo (HACK-16). */
const jsonBody = (email: string, role: UserRole = 'paciente') =>
  JSON.stringify(
    role === 'clinica'
      ? clinicSignUpBody(email, { name: 'Fulana', password: '12345678' })
      : { name: 'Fulana', email, password: '12345678' },
  );

test('C1 - formulário urlencoded de origem estranha responde 403, sem cookie e sem User', async () => {
  for (const role of roles) {
    const email = t.email();
    const form = new URLSearchParams({
      name: 'Atacante',
      email,
      password: '12345678',
    }).toString();
    const response = await post(t, role, form, {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'http://evil.example',
    });
    assert.equal(response.status, 403, role);
    assert.deepEqual(response.headers.getSetCookie(), [], role);
    assert.equal(await countByEmail(t, email), 0, role);
  }
});

test('C2 - JSON com Origin ausente, estranho, null ou de outra porta responde 403 ORIGIN_NOT_ALLOWED', async () => {
  const web = new URL(t.env.WEB_ORIGIN);
  const otherPort = new URL(t.env.WEB_ORIGIN);
  otherPort.port = String(Number(web.port || 80) + 1);
  const origins: (string | undefined)[] = [
    undefined,
    'http://evil.example',
    'null',
    otherPort.origin,
  ];
  let cases = 0;
  for (const role of roles) {
    for (const origin of origins) {
      const email = t.email();
      const response = await post(t, role, jsonBody(email, role), {
        'content-type': 'application/json',
        ...(origin === undefined ? {} : { origin }),
      });
      const label = `${role} ${String(origin)}`;
      assert.equal(response.status, 403, label);
      const body = (await response.json()) as { code?: string };
      assert.equal(body.code, 'ORIGIN_NOT_ALLOWED', label);
      assert.deepEqual(response.headers.getSetCookie(), [], label);
      assert.equal(await countByEmail(t, email), 0, label);
      cases++;
    }
  }
  assert.equal(cases, 8);
});

test('C3 - Origin certo com corpo que não é JSON responde 415; application/json com charset é aceito', async () => {
  const refused: (string | undefined)[] = [
    'application/x-www-form-urlencoded',
    'text/plain',
    'multipart/form-data; boundary=x',
    undefined,
  ];
  let cases = 0;
  for (const role of roles) {
    for (const contentType of refused) {
      const email = t.email();
      const response = await post(t, role, jsonBody(email, role), {
        origin: t.env.WEB_ORIGIN,
        ...(contentType === undefined ? {} : { 'content-type': contentType }),
      });
      const label = `${role} ${String(contentType)}`;
      assert.equal(response.status, 415, label);
      assert.equal(await countByEmail(t, email), 0, label);
      cases++;
    }
    const email = t.email();
    const accepted = await post(t, role, jsonBody(email, role), {
      origin: t.env.WEB_ORIGIN,
      'content-type': 'application/json; charset=utf-8',
    });
    assert.equal(accepted.status, 200, `${role} json+charset`);
    assert.equal(await countByEmail(t, email), 1);
    cases++;
  }
  assert.equal(cases, 10);
});

test('C6 - a N+1-ésima tentativa do mesmo IP na janela responde 429 sem criar User, contada por rota', async () => {
  // Instância própria: o armazenamento do limite é em memória, por aplicação.
  const app = await startTestApp();
  try {
    const { limit } = SIGN_UP_RATE_LIMIT;
    const headers = {
      origin: app.env.WEB_ORIGIN,
      'content-type': 'application/json',
    };
    for (let i = 0; i < limit; i++) {
      const response = await post(
        app,
        'paciente',
        jsonBody(app.email()),
        headers,
      );
      assert.equal(response.status, 200, `tentativa ${i + 1}`);
    }
    const email = app.email();
    const blocked = await post(app, 'paciente', jsonBody(email), headers);
    assert.equal(blocked.status, 429);
    assert.equal(await countByEmail(app, email), 0);
    const other = await post(
      app,
      'clinica',
      jsonBody(app.email(), 'clinica'),
      headers,
    );
    assert.equal(other.status, 200, '/clinica não divide a cota de /paciente');
  } finally {
    await app.close();
  }
});
