import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';

if (existsSync('.env')) loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `generate` não precisa de banco; `migrate` falha sem DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL },
});
