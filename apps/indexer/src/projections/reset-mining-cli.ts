import { createPrismaClient } from '@twilight-explorer/db';
import { withProjectionAdvisoryLock } from './advisory-lock.js';
import { resetMiningProjections, type ResetMiningProjectionPrisma } from './reset-mining.js';

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to reset the mining projections');
  }
  const prisma = createPrismaClient();
  try {
    await withProjectionAdvisoryLock(prisma, async () => {
      await resetMiningProjections(prisma as unknown as ResetMiningProjectionPrisma);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
