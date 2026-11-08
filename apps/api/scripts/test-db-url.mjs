// URL do Postgres local de compose.yaml; credenciais apenas locais, não são segredo.
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://hackathon:hackathon@127.0.0.1:5432/hackathon_test';
