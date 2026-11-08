import { defineConfig } from 'prisma/config';

// A CLI só precisa da URL para migrate; `prisma generate` funciona sem ela.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
