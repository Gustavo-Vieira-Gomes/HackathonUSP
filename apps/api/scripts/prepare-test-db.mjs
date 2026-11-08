// Aplica as migrations pendentes no banco de teste antes da suíte HTTP (AD-001).
// Não destrói dados: cada teste esvazia as tabelas com TRUNCATE (src/test-support).
import { spawnSync } from 'node:child_process';
import { testDatabaseUrl } from './test-db-url.mjs';

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
  },
  encoding: 'utf8',
});
if (result.status !== 0) {
  console.error(result.stdout, result.stderr);
  console.error(
    'Não foi possível preparar o banco de teste. Suba o Postgres com `docker compose up -d --wait postgres` ou defina TEST_DATABASE_URL.',
  );
  process.exit(1);
}
console.log('Banco de teste com as migrations aplicadas.');
