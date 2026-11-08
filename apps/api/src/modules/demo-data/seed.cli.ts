import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { seedDemo, validateSeedEnvironment } from './demo-seed';

async function main() {
  validateSeedEnvironment(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    console.log(JSON.stringify(await seedDemo(prisma)));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Seed não concluído: configuração, identidade ou transação inválida. Nenhum dado parcial foi confirmado.',
  );
  process.exitCode = 1;
});
