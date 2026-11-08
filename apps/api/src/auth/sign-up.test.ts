import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { signUpResponseSchema, type UserRole } from '@hackathon/contracts';
import { AuthService } from '@thallesp/nestjs-better-auth';
import {
  jsonRequest,
  signUp,
  startTestApp,
  type TestApp,
} from '../testing/test-app';

let t: TestApp;
before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.close();
});

const roles: UserRole[] = ['paciente', 'clinica'];
const countByEmail = (email: string) =>
  t.prisma.user.count({ where: { email } });

async function assertCreated(role: UserRole) {
  const email = t.email();
  const response = await signUp(t, role, {
    name: 'Fulana',
    email,
    password: '12345678',
  });
  assert.equal(response.status, 200, await response.clone().text());
  const body = signUpResponseSchema.parse(await response.json());
  assert.equal(body.user.role, role);
  assert.equal(body.user.email, email);
  const cookie = response.headers
    .getSetCookie()
    .find((line) => line.includes('session_token='));
  assert.ok(cookie, 'sem set-cookie de sessão');
  assert.match(cookie, /;\s*HttpOnly/i);
  const stored = await t.prisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal(stored.role, role);
}

test('C6 - cadastro de clínica responde 200 com role clinica e cookie HttpOnly', async () => {
  await assertCreated('clinica');
});

test('C7 - cadastro de paciente responde 200 com role paciente e cookie HttpOnly', async () => {
  await assertCreated('paciente');
});

test('C8 - corpo com role ou campo extra responde 400 e não cria usuário', async () => {
  let cases = 0;
  for (const role of roles) {
    const other: UserRole = role === 'paciente' ? 'clinica' : 'paciente';
    for (const extra of [{ role: other }, { foo: 'bar' }]) {
      const email = t.email();
      const response = await signUp(t, role, {
        name: 'Fulana',
        email,
        password: '12345678',
        ...extra,
      });
      assert.equal(response.status, 400, `${role} ${JSON.stringify(extra)}`);
      assert.equal(await countByEmail(email), 0);
      cases++;
    }
  }
  assert.equal(cases, 4);
});

test('C9 - e-mail já cadastrado responde 422 e não cria segundo usuário', async () => {
  const pairs: [UserRole, UserRole][] = [
    ['paciente', 'clinica'],
    ['clinica', 'paciente'],
    ['paciente', 'paciente'],
  ];
  for (const [first, second] of pairs) {
    const email = t.email();
    const created = await signUp(t, first, {
      name: 'A',
      email,
      password: '12345678',
    });
    assert.equal(created.status, 200);
    const repeated = await signUp(t, second, {
      name: 'B',
      email,
      password: '87654321',
    });
    assert.equal(repeated.status, 422, `${first}→${second}`);
    assert.equal(await countByEmail(email), 1);
    const stored = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(stored.role, first);
  }
});

test('C10 - senha de 7 caracteres responde 400 nas duas rotas e não cria usuário', async () => {
  for (const role of roles) {
    const email = t.email();
    const response = await signUp(t, role, {
      name: 'Fulana',
      email,
      password: '1234567',
    });
    assert.equal(response.status, 400, role);
    assert.equal(await countByEmail(email), 0);
  }
});

test('C11 - /api/auth/sign-up/email por HTTP responde 404 e não cria usuário', async () => {
  for (const extra of [{}, { role: 'clinica' }]) {
    const email = t.email();
    const response = await jsonRequest(t, 'POST', '/api/auth/sign-up/email', {
      name: 'Fulana',
      email,
      password: '12345678',
      ...extra,
    });
    assert.equal(response.status, 404);
    assert.equal(await countByEmail(email), 0);
  }
});

test('C12 - criação de User sem papel no contexto é recusada e insert sem role falha', async () => {
  const auth = t.app.get(AuthService);
  const email = t.email();
  await assert.rejects(
    auth.api.signUpEmail({
      body: { name: 'Sem papel', email, password: '12345678' },
    }),
  );
  assert.equal(await countByEmail(email), 0);

  const rawEmail = t.email();
  await assert.rejects(
    t.prisma
      .$executeRaw`INSERT INTO "User" ("id", "name", "email", "updatedAt") VALUES (${rawEmail}, 'Sem papel', ${rawEmail}, now())`,
  );
  assert.equal(await countByEmail(rawEmail), 0);
});
