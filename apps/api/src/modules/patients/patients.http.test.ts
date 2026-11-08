import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { apiErrorSchema, patientSchema } from '@hackathon/contracts';
import {
  call,
  closeDatabase,
  cookieHeader,
  countRows,
  query,
  resetDatabase,
  type RunningApi,
  sessionSetCookie,
  signUp,
  startApi,
  validSignUp,
} from '../../test-support/api';

let api: RunningApi;

before(async () => {
  api = await startApi();
});
after(async () => {
  await api.close();
  await closeDatabase();
});
beforeEach(resetDatabase);

function postPatient(body: unknown) {
  return call(api.url, 'POST', '/api/patients', { body });
}

function errorOf(body: unknown) {
  return apiErrorSchema.parse(body);
}

test('C1 cadastro válido responde 201 com o paciente e cookie de sessão', async () => {
  const result = await postPatient(validSignUp());

  assert.equal(result.status, 201);
  const body = result.body as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ['email', 'id', 'name', 'phone']);
  assert.equal(body.name, 'Maria Souza');
  assert.equal(body.email, 'maria@exemplo.com');
  assert.equal(body.phone, '+5511987654321');
  assert.ok(typeof body.id === 'string' && body.id.length > 0);

  const cookie = sessionSetCookie(result.setCookies);
  assert.ok(cookie, 'resposta sem cookie de sessão');
  const attributes = cookie
    .split(';')
    .slice(1)
    .map((part) => part.trim().toLowerCase());
  assert.ok(attributes.includes('httponly'));
  assert.ok(attributes.includes('samesite=lax'));
  assert.ok(attributes.includes('path=/'));
  assert.ok(attributes.includes('max-age=604800'));
});

test('C2 cadastro normaliza e-mail e telefone', async () => {
  const mobile = await postPatient(
    validSignUp({ email: ' Maria@Exemplo.com ', phone: '(11) 98765-4321' }),
  );
  assert.equal(mobile.status, 201);
  assert.equal((mobile.body as { email: string }).email, 'maria@exemplo.com');
  assert.equal((mobile.body as { phone: string }).phone, '+5511987654321');

  const landline = await postPatient(
    validSignUp({ email: 'joao@exemplo.com', phone: '1133334444' }),
  );
  assert.equal(landline.status, 201);
  assert.equal((landline.body as { phone: string }).phone, '+551133334444');

  const rows = await query<{ email: string; phone: string }>(
    'SELECT email, phone FROM "user" ORDER BY email',
  );
  assert.deepEqual(rows, [
    { email: 'joao@exemplo.com', phone: '+551133334444' },
    { email: 'maria@exemplo.com', phone: '+5511987654321' },
  ]);
});

test('C3 cadastro grava versão e horário do consentimento pelo servidor', async () => {
  const result = await postPatient(
    validSignUp({
      healthConsentAcceptedAt: '2000-01-01T00:00:00Z',
      role: 'admin',
    }),
  );
  assert.equal(result.status, 201);

  const [row] = await query<{
    healthConsentVersion: string;
    healthConsentAcceptedAt: Date;
    role: string;
  }>(
    'SELECT "healthConsentVersion", "healthConsentAcceptedAt", role FROM "user"',
  );
  assert.ok(row);
  assert.equal(row.healthConsentVersion, 'saude-v1');
  assert.equal(row.role, 'patient');
  const drift = Math.abs(Date.now() - row.healthConsentAcceptedAt.getTime());
  assert.ok(drift < 5000, `horário do consentimento a ${drift} ms do relógio`);
});

test('C4 cadastro sem consentimento responde 422 e não cria nada', async () => {
  const before = await countRows();
  const withoutConsent = validSignUp();
  delete (withoutConsent as Partial<typeof withoutConsent>).healthDataConsent;

  for (const body of [
    validSignUp({ healthDataConsent: false }),
    withoutConsent,
    validSignUp({ consentTermVersion: 'saude-v0' }),
  ]) {
    const result = await postPatient(body);
    assert.equal(result.status, 422);
    assert.equal(errorOf(result.body).code, 'consent_required');
    assert.equal(sessionSetCookie(result.setCookies), undefined);
  }
  assert.deepEqual(await countRows(), before);
});

test('C5 formato inválido tem precedência sobre consentimento', async () => {
  const result = await postPatient(
    validSignUp({
      name: '',
      email: 'sem-arroba',
      phone: '1',
      password: 'curta',
      healthDataConsent: false,
    }),
  );
  assert.equal(result.status, 400);
  assert.equal(errorOf(result.body).code, 'validation_failed');
  assert.deepEqual(await countRows(), { user: 0, account: 0, session: 0 });
});

test('C6 cadastro com formato inválido responde 400 com os campos', async () => {
  const cases: Array<[Record<string, unknown>, string[] | 201]> = [
    [{ password: 'a'.repeat(7) }, ['password']],
    [{ password: 'a'.repeat(8) }, 201],
    [{ password: 'a'.repeat(128) }, 201],
    [{ password: 'a'.repeat(129) }, ['password']],
    [{ name: '   ' }, ['name']],
    [{ name: 'M' }, ['name']],
    [{ email: 'maria.exemplo.com' }, ['email']],
    [{ phone: '119876543' }, ['phone']],
    [{ name: '', email: 'maria.exemplo.com' }, ['name', 'email']],
  ];

  for (const [index, [overrides, expected]] of cases.entries()) {
    const result = await postPatient(
      validSignUp({ email: `caso${index}@exemplo.com`, ...overrides }),
    );
    if (expected === 201) {
      assert.equal(result.status, 201, JSON.stringify(overrides));
      continue;
    }
    assert.equal(result.status, 400, JSON.stringify(overrides));
    const error = errorOf(result.body);
    assert.equal(error.code, 'validation_failed');
    assert.deepEqual(error.fields, expected, JSON.stringify(overrides));
  }
  assert.equal((await countRows()).user, 2);
});

test('C7 e-mail já cadastrado responde 409 sem alterar a conta', async () => {
  await signUp(api.url);

  const duplicate = await postPatient(
    validSignUp({
      email: 'MARIA@exemplo.com',
      name: 'Outra Pessoa',
      phone: '(21) 91111-2222',
      password: 'outra-senha-456',
    }),
  );
  assert.equal(duplicate.status, 409);
  assert.equal(errorOf(duplicate.body).code, 'email_in_use');
  assert.equal(sessionSetCookie(duplicate.setCookies), undefined);

  const rows = await query<{ name: string; phone: string }>(
    'SELECT name, phone FROM "user"',
  );
  assert.deepEqual(rows, [{ name: 'Maria Souza', phone: '+5511987654321' }]);

  const oldPassword = await call(api.url, 'POST', '/api/sessions', {
    body: { email: 'maria@exemplo.com', password: 'senha-da-maria-123' },
  });
  assert.equal(oldPassword.status, 200);
  const newPassword = await call(api.url, 'POST', '/api/sessions', {
    body: { email: 'maria@exemplo.com', password: 'outra-senha-456' },
  });
  assert.equal(newPassword.status, 401);
});

test('C8 senha nunca é gravada nem devolvida em texto', async () => {
  const password = 'senha-unica-para-busca-987';
  const created = await postPatient(validSignUp({ password }));
  const login = await call(api.url, 'POST', '/api/sessions', {
    body: { email: 'maria@exemplo.com', password },
  });
  const me = await call(api.url, 'GET', '/api/patients/me', {
    cookie: cookieHeader(login.setCookies),
  });

  for (const response of [created, login, me]) {
    assert.ok(response.status < 300, response.text);
    assert.ok(!response.text.includes(password));
    assert.ok(!('password' in (response.body as object)));
  }
  for (const table of ['user', 'account', 'session']) {
    const rows = await query<{ row: string }>(
      `SELECT row_to_json(t)::text AS row FROM "${table}" t`,
    );
    assert.ok(rows.length > 0, `tabela ${table} vazia`);
    for (const { row } of rows) assert.ok(!row.includes(password), table);
  }
  const [account] = await query<{ password: string | null }>(
    'SELECT password FROM "account"',
  );
  assert.ok(account?.password, 'credencial sem hash');
});

test('C9 cadastros simultâneos do mesmo e-mail criam uma conta só', async () => {
  const results = await Promise.all([
    postPatient(validSignUp()),
    postPatient(validSignUp({ name: 'Maria Duplicada' })),
  ]);
  const statuses = results.map((result) => result.status).sort();
  assert.deepEqual(statuses, [201, 409]);
  const conflict = results.find((result) => result.status === 409);
  assert.equal(errorOf(conflict?.body).code, 'email_in_use');
  assert.equal((await countRows()).user, 1);
});

test('C10 schema recusa usuário sem consentimento ou com e-mail repetido', async () => {
  const insert = (columns: Record<string, unknown>) => {
    const names = Object.keys(columns);
    const sql = `INSERT INTO "user" (${names.map((name) => `"${name}"`).join(', ')})
                 VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')})`;
    return query(sql, Object.values(columns));
  };
  const complete = {
    id: 'u1',
    name: 'Maria',
    email: 'maria@exemplo.com',
    phone: '+5511987654321',
    healthConsentVersion: 'saude-v1',
    healthConsentAcceptedAt: new Date(),
    updatedAt: new Date(),
  };
  for (const missing of [
    'healthConsentVersion',
    'healthConsentAcceptedAt',
    'phone',
  ]) {
    const columns: Record<string, unknown> = { ...complete };
    delete columns[missing];
    await assert.rejects(insert(columns), { code: '23502' }, missing);
  }
  await insert(complete);
  await assert.rejects(insert({ ...complete, id: 'u2' }), { code: '23505' });
});

test('C21 /me com sessão válida devolve o dono da sessão', async () => {
  const { id, cookie } = await signUp(api.url);
  const result = await call(api.url, 'GET', '/api/patients/me', { cookie });
  assert.equal(result.status, 200);
  assert.deepEqual(patientSchema.strict().parse(result.body), {
    id,
    name: 'Maria Souza',
    email: 'maria@exemplo.com',
    phone: '+5511987654321',
  });
});

test('C22 /me sem sessão válida responde 401', async () => {
  const { cookie } = await signUp(api.url);
  const [name, value = ''] = cookie.split('=');
  const tampered = `${name}=${value[0] === 'a' ? 'b' : 'a'}${value.slice(1)}`;

  const expectUnauthenticated = async (label: string, header?: string) => {
    const result = await call(api.url, 'GET', '/api/patients/me', {
      cookie: header,
    });
    assert.equal(result.status, 401, label);
    assert.equal(errorOf(result.body).code, 'unauthenticated', label);
  };

  await expectUnauthenticated('sem cookie');
  await expectUnauthenticated(
    'token desconhecido',
    `${name}=token-que-nao-existe.assinatura`,
  );
  await expectUnauthenticated('cookie adulterado', tampered);

  await query(`UPDATE "session" SET "expiresAt" = now() - interval '1 second'`);
  await expectUnauthenticated('sessão expirada', cookie);

  const second = await signUp(api.url, { email: 'joao@exemplo.com' });
  const signOut = await call(api.url, 'DELETE', '/api/sessions/current', {
    cookie: second.cookie,
  });
  assert.equal(signOut.status, 204);
  await expectUnauthenticated('sessão revogada', second.cookie);
});

test('C32 identidade vem só da sessão, ignorando o id enviado pelo cliente', async () => {
  const maria = await signUp(api.url);
  const joao = await signUp(api.url, {
    name: 'João Lima',
    email: 'joao@exemplo.com',
    phone: '(21) 97777-6666',
  });

  for (const options of [
    { path: `/api/patients/me?patientId=${joao.id}&id=${joao.id}` },
    { path: '/api/patients/me', headers: { 'x-patient-id': joao.id } },
  ]) {
    const result = await call(api.url, 'GET', options.path, {
      cookie: maria.cookie,
      headers: options.headers,
    });
    assert.equal(result.status, 200);
    assert.equal((result.body as { id: string }).id, maria.id);
    assert.ok(!result.text.includes('João Lima'));
  }
});

test('C33 não existe rota de paciente por id', async () => {
  const maria = await signUp(api.url);
  const joao = await signUp(api.url, {
    name: 'João Lima',
    email: 'joao@exemplo.com',
    phone: '(21) 97777-6666',
  });

  const result = await call(api.url, 'GET', `/api/patients/${joao.id}`, {
    cookie: maria.cookie,
  });
  assert.equal(result.status, 404);
  assert.equal(errorOf(result.body).code, 'not_found');
  for (const value of ['João Lima', 'joao@exemplo.com', '+5521977776666']) {
    assert.ok(!result.text.includes(value), value);
  }
});
