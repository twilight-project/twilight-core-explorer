import { RestRpcChainClient } from '@twilight-explorer/chain-client';
import { loadConfig } from '@twilight-explorer/config';
import { createPrismaClient } from '@twilight-explorer/db';
import { withProjectionAdvisoryLock } from './advisory-lock.js';
import { getOrCreateProjectionCursor } from './cursor.js';
import {
  seedCoreSlotGenesisIdentity,
  type CoreSlotGenesisIdentityPrisma,
} from './coreslot-genesis-identity.js';
import {
  projectCoreSlotMetadataRange,
  type CoreSlotMetadataProjectionPrisma,
} from './coreslot-metadata.js';
import {
  resetCoreSlotMetadataProjection,
  type ResetProjectionPrisma,
} from './reset.js';
import { CORESLOT_METADATA_PROJECTION } from './types.js';

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for CoreSlot metadata projection');
  }

  const config = loadConfig(process.env);
  const chainId = config.chainId;
  const prisma = createPrismaClient();
  // The genesis identity seed reads the genesis document through ChainClient. Without a client
  // here the forward (tick-loop) path could never seed genesis-created slots at all — they'd
  // surface with NULL status/consensus until a full reset+rebuild (seen live on devnet).
  const client = new RestRpcChainClient({
    cometRpcUrl: config.cometRpcUrl,
    restUrl: config.restUrl,
    timeoutMs: config.requestTimeoutMs,
  });

  try {
    await withProjectionAdvisoryLock(prisma, async () => {
      if (process.env.RESET_PROJECTION === 'true') {
        await resetCoreSlotMetadataProjection(prisma as unknown as ResetProjectionPrisma);
      }

      const cursor = await getOrCreateProjectionCursor(
        prisma,
        CORESLOT_METADATA_PROJECTION,
        chainId,
      );
      const startHeight = parseOptionalHeight(process.env.START_HEIGHT)
        ?? parseHeight(asRecord(cursor).lastProjectedHeight) + 1n;
      const endHeight = parseOptionalHeight(process.env.END_HEIGHT)
        ?? await getMaxBlockHeight(prisma as unknown as BlockAggregatePrisma);

      // SEED_GENESIS=true forces a one-shot (re)seed/repair regardless of cursor position —
      // the recovery lever for a deployment whose first ticks ran without chain connectivity.
      const seedGenesis = process.env.SEED_GENESIS === 'true'
        || process.env.RESET_PROJECTION === 'true'
        || startHeight <= 1n;

      if (endHeight < startHeight) {
        // Nothing to replay, but the seed must not silently die with the early return —
        // an empty DB's very first tick lands here (endHeight 0), which is exactly when
        // the genesis baseline should be written.
        if (seedGenesis) {
          await seedCoreSlotGenesisIdentity({
            prisma: prisma as unknown as CoreSlotGenesisIdentityPrisma,
            chainId,
            client,
          });
        }
        return;
      }

      await projectCoreSlotMetadataRange({
        prisma: prisma as unknown as CoreSlotMetadataProjectionPrisma,
        chainId,
        startHeight,
        endHeight,
        client,
        seedGenesis,
      });
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
