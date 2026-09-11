import { createPrismaClient } from '@twilight-explorer/db';
import { resetOperatorStatus, type ResetOperatorStatusPrisma } from './reset-operator-status.js';

declare const process: { env: Record<string, string | undefined>; exitCode?: number };

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to reset operator-status samples');
  }
  const prisma = createPrismaClient();
  try {
    await resetOperatorStatus(prisma as unknown as ResetOperatorStatusPrisma);
    console.log('[reset-operator-status] all operator-status samples deleted');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[reset-operator-status] fatal:', err);
  process.exitCode = 1;
});
