import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

async function main() {
  // Delete all imported test charges (from the test file we just sent)
  const result = await db.charge.deleteMany({
    where: { source: 'IMPORT' },
  });
  console.log('Deleted test charges:', result.count);

  const remaining = await db.charge.count();
  console.log('Remaining charges in DB:', remaining);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
