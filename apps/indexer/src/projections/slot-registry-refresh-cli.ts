import { RestRpcChainClient } from '@twilight-explorer/chain-client';
import { loadConfig } from '@twilight-explorer/config';
import { createPrismaClient } from '@twilight-explorer/db';
import { withProjectionAdvisoryLock } from './advisory-lock.js';
import {
  refreshSlotRegistry,
  type SlotRegistryRefreshClient,
  type SlotRegistryRefreshPrisma,
} from './slot-registry-refresh.js';

declare const process: { env: Record<string, string | undefined>; exitCode?: number };

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the slot-registry refresh');
  }
  const config = loadConfig(process.env);
  const prisma = createPrismaClient();
  const client = new RestRpcChainClient({
    cometRpcUrl: config.cometRpcUrl,
    restUrl: config.restUrl,
    timeoutMs: config.requestTimeoutMs,
  });
  try {
    await withProjectionAdvisoryLock(prisma, async () => {
      const r = await refreshSlotRegistry({
        prisma: prisma as unknown as SlotRegistryRefreshPrisma,
        client: client as unknown as SlotRegistryRefreshClient,
      });
      if (r.failed) {
        console.error('[slot-registry-refresh] chain read failed — sample skipped');
        return;
      }
      console.log(`[slot-registry-refresh] ${r.slotsSeen} slots seen, ${r.filled} rows filled`);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[slot-registry-refresh] fatal:', err);
  process.exitCode = 1;
});
