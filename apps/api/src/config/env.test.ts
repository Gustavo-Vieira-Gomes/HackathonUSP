import assert from 'node:assert/strict';
import test from 'node:test';
import { EnvValidationError, loadEnv, REQUIRED_ENV } from './env';

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
