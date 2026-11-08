import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EnvValidationError,
  GOOGLE_CALENDAR_ENV,
  googleCalendarConfig,
  loadEnv,
  REQUIRED_ENV,
} from './env';

const valid = {
  DATABASE_URL: 'postgresql://usuario:senha-db-teste@127.0.0.1:5432/banco',
  BETTER_AUTH_SECRET: 'segredo-de-teste-com-32-caracteres!',
  BETTER_AUTH_URL: 'http://127.0.0.1:3001',
  WEB_ORIGIN: 'http://127.0.0.1:3000',
};

test('C4 - cada variável obrigatória ausente ou vazia falha citando o nome e nenhum valor', () => {
  assert.deepEqual([...REQUIRED_ENV].sort(), Object.keys(valid).sort());
  let cases = 0;
  for (const name of REQUIRED_ENV) {
    for (const mode of ['ausente', 'vazia'] as const) {
      const source: Record<string, string | undefined> = { ...valid };
      if (mode === 'ausente') delete source[name];
      else source[name] = '';
      assert.throws(
        () => loadEnv(source),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, new RegExp(`\\b${name}\\b`));
          for (const value of Object.values(valid)) {
            assert.equal(
              error.message.includes(value),
              false,
              `${name} ${mode}: vazou valor`,
            );
          }
          return true;
        },
        `${name} ${mode}`,
      );
      cases++;
    }
  }
  assert.equal(cases, 8);
});

test('C5 - BETTER_AUTH_SECRET com 31 caracteres falha e com 32 é aceito', () => {
  const secret31 = 'a'.repeat(31);
  assert.throws(
    () => loadEnv({ ...valid, BETTER_AUTH_SECRET: secret31 }),
    (error: unknown) =>
      error instanceof Error &&
      /BETTER_AUTH_SECRET/.test(error.message) &&
      !error.message.includes(secret31),
  );
  const env = loadEnv({ ...valid, BETTER_AUTH_SECRET: 'a'.repeat(32) });
  assert.equal(env.BETTER_AUTH_SECRET.length, 32);
});

test('C8 - BETTER_AUTH_SECRET de exemplo é recusado citando só o nome; segredo aleatório é aceito', () => {
  const pad = '-com-mais-de-32-caracteres-de-tamanho';
  const examples = [
    'troque-por-um-segredo-local-de-32-caracteres',
    `troque${pad}`,
    `TROQUE${pad}`,
    `change-me${pad}`,
    `CHANGE-ME${pad}`,
    `changeme${pad}`,
    `ChangeMe${pad}`,
  ];
  for (const secret of examples) {
    assert.throws(
      () => loadEnv({ ...valid, BETTER_AUTH_SECRET: secret }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /\bBETTER_AUTH_SECRET\b/);
        assert.equal(error.message.includes(secret), false, 'vazou o valor');
        return true;
      },
      secret,
    );
  }
  const random = 'q8Zr0tY1vB3nM5kL7jH9gF2dS4aP6oI8uE0wQ2xC4zV=';
  assert.equal(random.length, 44);
  assert.equal(
    loadEnv({ ...valid, BETTER_AUTH_SECRET: random }).BETTER_AUTH_SECRET,
    random,
  );
});

test('HACK-46 - DEMO_CLOCK_ENABLED=true exige DEMO_CLOCK_TOKEN de 32 caracteres ou mais', () => {
  const token = 'token-do-operador-com-32-caracteres!';
  for (const bad of [undefined, '', 'curto-demais']) {
    assert.throws(
      () =>
        loadEnv({
          ...valid,
          DEMO_CLOCK_ENABLED: 'true',
          DEMO_CLOCK_TOKEN: bad,
        }),
      (error: unknown) =>
        error instanceof Error &&
        /DEMO_CLOCK_TOKEN/.test(error.message) &&
        (bad === undefined || bad === '' || !error.message.includes(bad)),
      String(bad),
    );
  }
  const env = loadEnv({
    ...valid,
    DEMO_CLOCK_ENABLED: 'true',
    DEMO_CLOCK_TOKEN: token,
  });
  assert.equal(env.DEMO_CLOCK_ENABLED, true);
  assert.equal(env.DEMO_CLOCK_TOKEN, token);
});

test('HACK-46 - flag desligada aceita token ausente ou vazio', () => {
  for (const DEMO_CLOCK_TOKEN of [undefined, '']) {
    const env = loadEnv({ ...valid, DEMO_CLOCK_TOKEN });
    assert.equal(env.DEMO_CLOCK_ENABLED, false);
    assert.equal(env.DEMO_CLOCK_TOKEN, undefined);
  }
});

test('H16-C17 - GEOCODER_* têm padrão e valor inválido falha citando a variável', () => {
  const env = loadEnv(valid);
  assert.equal(env.GEOCODER_URL, 'https://nominatim.openstreetmap.org');
  assert.equal(env.GEOCODER_USER_AGENT, 'hackathon-usp-marketplace/0.1');
  assert.equal(env.GEOCODER_MIN_INTERVAL_MS, 1000);

  const invalid: [string, string][] = [
    ['GEOCODER_URL', 'nao-e-url'],
    ['GEOCODER_MIN_INTERVAL_MS', '-1'],
    ['GEOCODER_MIN_INTERVAL_MS', 'abc'],
  ];
  for (const [name, value] of invalid) {
    assert.throws(
      () => loadEnv({ ...valid, [name]: value }),
      (error: unknown) => {
        assert.ok(error instanceof EnvValidationError, `${name}=${value}`);
        assert.match(error.message, new RegExp(`\\b${name}\\b`));
        return true;
      },
    );
  }
  assert.equal(invalid.length, 3);
});

// HACK-18: as quatro GOOGLE_* vêm juntas ou nenhuma.
const google = {
  GOOGLE_OAUTH_CLIENT_ID: 'id-do-cliente-google-de-teste.apps',
  GOOGLE_OAUTH_CLIENT_SECRET: 'segredo-do-cliente-google-de-teste',
  GOOGLE_OAUTH_REDIRECT_URI:
    'http://127.0.0.1:3000/api/google-calendar/callback',
  GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

function assertRejectedNaming(
  source: Record<string, string | undefined>,
  names: readonly string[],
  secrets: readonly string[],
) {
  assert.throws(
    () => loadEnv(source),
    (error: unknown) => {
      assert.ok(error instanceof EnvValidationError);
      for (const name of names) {
        assert.match(error.message, new RegExp(`\\b${name}\\b`));
      }
      for (const secret of secrets) {
        assert.equal(error.message.includes(secret), false, 'vazou valor');
      }
      return true;
    },
  );
}

test('H18-C1 - uma ou três das quatro GOOGLE_* preenchidas recusam o boot citando só os nomes faltantes', () => {
  let cases = 0;
  for (const name of GOOGLE_CALENDAR_ENV) {
    // só esta preenchida
    const only = { ...valid, [name]: google[name] };
    assertRejectedNaming(
      only,
      GOOGLE_CALENDAR_ENV.filter((other) => other !== name),
      Object.values(google),
    );
    cases++;
    // só esta faltando
    const others = { ...valid, ...google, [name]: '' };
    assertRejectedNaming(others, [name], Object.values(google));
    cases++;
  }
  assert.equal(cases, 8);
});

test('H18-C2 - GOOGLE_TOKEN_ENCRYPTION_KEY com 31 ou 33 bytes ou fora de base64 é recusada; 32 bytes passa', () => {
  const bad = [
    Buffer.alloc(31, 1).toString('base64'),
    Buffer.alloc(33, 1).toString('base64'),
    'isto não é base64 de jeito nenhum!!!!!!!!!!!',
  ];
  for (const key of bad) {
    assertRejectedNaming(
      { ...valid, ...google, GOOGLE_TOKEN_ENCRYPTION_KEY: key },
      ['GOOGLE_TOKEN_ENCRYPTION_KEY'],
      [key, google.GOOGLE_OAUTH_CLIENT_SECRET],
    );
  }
  const ok = Buffer.alloc(32, 2).toString('base64');
  const env = loadEnv({ ...valid, ...google, GOOGLE_TOKEN_ENCRYPTION_KEY: ok });
  assert.equal(googleCalendarConfig(env)?.encryptionKey.length, 32);
});

test('H18-C3 - sem nenhuma GOOGLE_* a integração fica indisponível; com as quatro, disponível', () => {
  assert.equal(googleCalendarConfig(loadEnv({ ...valid })), null);
  const blank = Object.fromEntries(GOOGLE_CALENDAR_ENV.map((n) => [n, '']));
  assert.equal(googleCalendarConfig(loadEnv({ ...valid, ...blank })), null);
  const config = googleCalendarConfig(loadEnv({ ...valid, ...google }));
  assert.ok(config);
  assert.equal(config.clientId, google.GOOGLE_OAUTH_CLIENT_ID);
  assert.equal(config.redirectUri, google.GOOGLE_OAUTH_REDIRECT_URI);
});
