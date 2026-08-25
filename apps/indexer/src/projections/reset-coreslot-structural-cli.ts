import { createPrismaClient } from '@twilight-explorer/db';
import { withProjectionAdvisoryLock } from './advisory-lock.js';
import { resetCoreSlotStructuralProjection, type ResetCoreSlotStructuralPrisma } from './reset-coreslot-structural.js';

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to reset the CoreSlot structural projection');
  }
  const prisma = createPrismaClient();
  try {
    await withProjectionAdvisoryLock(prisma, async () => {
      await resetCoreSlotStructuralProjection(prisma as unknown as ResetCoreSlotStructuralPrisma);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
