import { RestRpcChainClient } from '@twilight-explorer/chain-client';
import { loadConfig } from '@twilight-explorer/config';
import { createPrismaClient } from '@twilight-explorer/db';
import { withProjectionAdvisoryLock } from './advisory-lock.js';
import { getOrCreateProjectionCursor } from './cursor.js';
import {
  projectRewardsEntitlements,
  type RewardsEntitlementsChainClient,
  type RewardsEntitlementsPrisma,
} from './rewards-entitlements.js';
import { REWARDS_ENTITLEMENTS_PROJECTION } from './types.js';

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the rewards entitlements projection');
  }

  const config = loadConfig(process.env);
  const chainId = config.chainId;
  const prisma = createPrismaClient();
  const client = new RestRpcChainClient({
    cometRpcUrl: config.cometRpcUrl,
    restUrl: config.restUrl,
    timeoutMs: config.requestTimeoutMs,
  });

  try {
    await withProjectionAdvisoryLock(prisma, async () => {
      if (process.env.RESET_PROJECTION === 'true') {
        await prisma.slotEntitlementProjection.deleteMany();
        await prisma.projectionFailure.deleteMany({
          where: { projectionName: REWARDS_ENTITLEMENTS_PROJECTION },
        });
        await prisma.projectionCursor.deleteMany({
          where: { projectionName: REWARDS_ENTITLEMENTS_PROJECTION },
        });
      }

      const cursor = await getOrCreateProjectionCursor(
        prisma,
        REWARDS_ENTITLEMENTS_PROJECTION,
        chainId,
      );
      const startHeight = parseOptionalHeight(process.env.START_HEIGHT)
        ?? parseHeight(asRecord(cursor).lastProjectedHeight) + 1n;
      const endHeight = parseOptionalHeight(process.env.END_HEIGHT)
        ?? await getMaxBlockHeight(prisma as unknown as BlockAggregatePrisma);

      if (endHeight < startHeight) return;

      // The sample is attributed to the height the run observed. Entitlements are durable
      // current state, so unlike the height-pinned snapshots this is a LABEL, not a query
      // constraint — it cannot be invalidated by the node's state pruning.
      const result = await projectRewardsEntitlements({
        prisma: prisma as unknown as RewardsEntitlementsPrisma,
        client: client as unknown as RewardsEntitlementsChainClient,
        chainId,
        startHeight,
        endHeight,
        sampledAtHeight: endHeight,
        refreshEpochs: parsePositiveInt(process.env.ENTITLEMENT_REFRESH_EPOCHS),
      });

      if (result.failed) {
        process.exitCode = 1;
      } else {
        console.log(
          `[rewards-entitlements] sampled ${result.epochsSampled} epoch(s), `
            + `${result.rowsWritten} entitlement rows at height ${endHeight}`,
        );
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

interface BlockAggregatePrisma {
  block: { aggregate(args: unknown): Promise<{ _max?: { height?: bigint | null } | undefined }> };
}

async function getMaxBlockHeight(prisma: BlockAggregatePrisma): Promise<bigint> {
  const result = await prisma.block.aggregate({ _max: { height: true } });
  return result._max?.height ?? 0n;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOptionalHeight(value: string | undefined): bigint | undefined {
  if (!value?.trim()) return undefined;
  return BigInt(value);
}

function parseHeight(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string' && value.trim()) return BigInt(value);
  return 0n;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
