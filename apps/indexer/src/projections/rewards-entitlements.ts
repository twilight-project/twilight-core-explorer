import {
  haltProjectionCursorError,
  updateProjectionCursorSuccess,
  type ProjectionCursorPrisma,
} from './cursor.js';
import {
  EPOCH_FINALIZED_EVENT_TYPE,
  REWARDS_ENTITLEMENTS_PROJECTION,
  REWARDS_NATIVE_DENOM,
  withProjectionFailureKey,
  type ProjectionFailureInput,
} from './types.js';

/**
 * Observed-sample projection for reward ENTITLEMENTS (projection rewards_entitlements_v1).
 *
 * An entitlement is the V2 unit of reward truth: when x/rewards finalizes epoch N it creates
 * one immutable entitlement per eligible CoreSlot, and x/mining settlement then releases it.
 *
 * Why this cannot be a rebuildable projection: entitlement creation is SILENT. The chain emits
 * only `epoch_finalized`, which carries pool-level aggregates and no per-slot detail, so the
 * per-slot amounts exist nowhere in the indexed generic rows. They have to be read back from
 * the chain — hence an observed sample carrying `sampledAtHeight`.
 *
 * Two things drive a sample:
 *  1. An `epoch_finalized` event in the projected range tells us a new epoch's entitlements
 *     now exist. That is the backfill path and it is exact.
 *  2. `releasedAmount` MOVES after creation as settlement pays the entitlement down, so the
 *     most recent epochs are re-sampled every run. Sampling once at epoch close would freeze
 *     every entitlement at released=0 forever, which would be quietly wrong rather than
 *     merely stale. The default window covers the chain's settlement window with margin.
 *
 * Pruning note: these reads are deliberately NOT height-pinned. Entitlements are durable
 * current state (an epoch-5 entitlement still reads back today), so this projector is immune
 * to the node's ~100-block state retention that constrains the height-pinned snapshots.
 */
export const DEFAULT_ENTITLEMENT_REFRESH_EPOCHS = 6;

export interface RewardsEntitlementsChainClient {
  getEpochEntitlements(
    epoch: bigint,
    pagination?: { key?: string | undefined },
  ): Promise<{ raw: unknown }>;
}

export interface RewardsEntitlementsPrisma extends ProjectionCursorPrisma {
  event: { findMany(args: unknown): Promise<EventSource[]> };
  slotEntitlementProjection: {
    findMany(args: unknown): Promise<{ epochNumber: bigint }[]>;
    upsert(args: unknown): Promise<unknown>;
  };
  projectionFailure: {
    upsert(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  $transaction<T>(
    fn: (tx: RewardsEntitlementsPrisma) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T>;
}

interface EventSource {
  id: bigint;
  height: bigint;
  type: string;
  attributesJson: unknown;
}

export interface ProjectRewardsEntitlementsArgs {
  prisma: RewardsEntitlementsPrisma;
  client: RewardsEntitlementsChainClient;
  chainId: string;
  startHeight: bigint;
  endHeight: bigint;
  /** Height the sample is attributed to (the tip when the run started). */
  sampledAtHeight: bigint;
  refreshEpochs?: number | undefined;
}

export interface ProjectRewardsEntitlementsResult {
  epochsSampled: number;
  rowsWritten: number;
  failuresCreated: number;
  failed: boolean;
}

const TX_TIMEOUT_MS = 60_000;
const TX_MAX_WAIT_MS = 15_000;

export async function projectRewardsEntitlements(
  args: ProjectRewardsEntitlementsArgs,
): Promise<ProjectRewardsEntitlementsResult> {
  const { prisma, client, chainId, startHeight, endHeight, sampledAtHeight } = args;
  const refreshEpochs = args.refreshEpochs ?? DEFAULT_ENTITLEMENT_REFRESH_EPOCHS;

  try {
    // Epochs closed inside this range: the newly-created entitlements.
    const finalizedEvents = await prisma.event.findMany({
      where: { height: { gte: startHeight, lte: endHeight }, type: EPOCH_FINALIZED_EVENT_TYPE },
      orderBy: [{ id: 'asc' }],
    });

    const epochs = new Set<bigint>();
    for (const event of finalizedEvents) {
      const epoch = parseBigInt(attributesToRecord(event.attributesJson).epoch);
      if (epoch === undefined) {
        await createFailure(prisma, {
          sourceHeight: event.height,
          sourceEventId: event.id,
          eventType: event.type,
          failureKind: 'invalid_epoch',
          rawEventJson: { id: event.id.toString(), attributes: event.attributesJson },
          error: 'epoch_finalized carried no parseable epoch; cannot sample its entitlements.',
        });
        continue;
      }
      epochs.add(epoch);
    }

    // Re-sample the most recent known epochs so releasedAmount tracks settlement progress.
    for (const epoch of await recentKnownEpochs(prisma, refreshEpochs)) epochs.add(epoch);

    if (epochs.size === 0) {
      await updateProjectionCursorSuccess(
        prisma,
        REWARDS_ENTITLEMENTS_PROJECTION,
        chainId,
        endHeight,
      );
      return { epochsSampled: 0, rowsWritten: 0, failuresCreated: 0, failed: false };
    }

    // READ every epoch first; write nothing until all reads succeed, so a mid-way chain
    // failure never leaves a half-sampled epoch set behind.
    const sampled: Array<{ epoch: bigint; entitlements: EntitlementSource[]; raw: unknown }> = [];
    const ordered = [...epochs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    try {
      for (const epoch of ordered) {
        let key: string | undefined;
        let guard = 0;
        const entitlements: EntitlementSource[] = [];
        let raw: unknown;
        do {
          const page = await client.getEpochEntitlements(epoch, key ? { key } : undefined);
          raw = page.raw;
          entitlements.push(...extractEntitlements(page.raw));
          key = extractNextKey(page.raw);
          guard += 1;
        } while (key && guard < 10_000);
        sampled.push({ epoch, entitlements, raw });
      }
    } catch (error) {
      await haltProjectionCursorError(
        prisma,
        REWARDS_ENTITLEMENTS_PROJECTION,
        chainId,
        endHeight,
        error,
      );
      await createFailure(prisma, {
        sourceHeight: endHeight,
        failureKind: 'entitlements_chain_read_failed',
        error: formatError(error),
      });
      return { epochsSampled: 0, rowsWritten: 0, failuresCreated: 1, failed: true };
    }

    let rowsWritten = 0;
    await prisma.$transaction(async (tx) => {
      for (const { epoch, entitlements } of sampled) {
        for (const e of entitlements) {
          const row = {
            slotId: e.slotId,
            epochNumber: epoch,
            totalBlocksActive: e.totalBlocksActive,
            entitlementAmount: e.entitlementAmount,
            releasedAmount: e.releasedAmount,
            denom: REWARDS_NATIVE_DENOM,
            payoutAddress: e.payoutAddress,
            rewardConfigVersion: e.rewardConfigVersion,
            slotStatusAtEpochClose: e.slotStatusAtEpochClose,
            activationSequenceAtEpochClose: e.activationSequenceAtEpochClose,
            createdHeight: e.createdHeight,
            sampledAtHeight,
            rawSnapshotJson: e.raw ?? undefined,
          };
          await tx.slotEntitlementProjection.upsert({
            where: { slotId_epochNumber: { slotId: e.slotId, epochNumber: epoch } },
            create: row,
            update: row,
          });
          rowsWritten += 1;
        }
      }
      await updateProjectionCursorSuccess(tx, REWARDS_ENTITLEMENTS_PROJECTION, chainId, endHeight);
    }, { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS });

    return { epochsSampled: sampled.length, rowsWritten, failuresCreated: 0, failed: false };
  } catch (error) {
    await haltProjectionCursorError(
      prisma,
      REWARDS_ENTITLEMENTS_PROJECTION,
      chainId,
      endHeight,
      error,
    );
    throw error;
  }
}

/** The N highest epochs already sampled — the ones whose releasedAmount can still move. */
async function recentKnownEpochs(
  prisma: RewardsEntitlementsPrisma,
  count: number,
): Promise<bigint[]> {
  if (count <= 0) return [];
  const rows = await prisma.slotEntitlementProjection.findMany({
    distinct: ['epochNumber'],
    orderBy: { epochNumber: 'desc' },
    take: count,
    select: { epochNumber: true },
  });
  return rows.map((r) => r.epochNumber);
}

interface EntitlementSource {
  slotId: bigint;
  totalBlocksActive: bigint | null;
  entitlementAmount: string;
  releasedAmount: string;
  payoutAddress: string | null;
  rewardConfigVersion: bigint | null;
  slotStatusAtEpochClose: string | null;
  activationSequenceAtEpochClose: bigint | null;
  createdHeight: bigint | null;
  raw: unknown;
}

function extractEntitlements(raw: unknown): EntitlementSource[] {
  const root = asRecord(raw);
  const list = readArray(root.entitlements) ?? readArray(root.slot_entitlements) ?? readArray(raw)
    ?? [];
  const out: EntitlementSource[] = [];
  for (const item of list) {
    const record = asRecord(item);
    const slotId = parseBigInt(readString(record.slot_id) ?? readString(record.slotId));
    const entitlementAmount = readString(record.entitlement_amount)
      ?? readString(record.entitlementAmount);
    // Without a slot id or an amount there is nothing trustworthy to record — skip rather
    // than write a row with invented identity.
    if (slotId === undefined || entitlementAmount === undefined) continue;
    out.push({
      slotId,
      totalBlocksActive: parseBigInt(
        readString(record.total_blocks_active) ?? readString(record.totalBlocksActive),
      ) ?? null,
      entitlementAmount,
      releasedAmount: readString(record.released_amount) ?? readString(record.releasedAmount) ?? '0',
      payoutAddress: readString(record.payout_address) ?? readString(record.payoutAddress) ?? null,
      rewardConfigVersion: parseBigInt(
        readString(record.reward_config_version) ?? readString(record.rewardConfigVersion),
      ) ?? null,
      slotStatusAtEpochClose: readString(record.slot_status_at_epoch_close)
        ?? readString(record.slotStatusAtEpochClose) ?? null,
      activationSequenceAtEpochClose: parseBigInt(
        readString(record.activation_sequence_at_epoch_close)
        ?? readString(record.activationSequenceAtEpochClose),
      ) ?? null,
      createdHeight: parseBigInt(
        readString(record.created_height) ?? readString(record.createdHeight),
      ) ?? null,
      raw: item,
    });
  }
  return out;
}

async function createFailure(
  prisma: Pick<RewardsEntitlementsPrisma, 'projectionFailure'>,
  input: Omit<ProjectionFailureInput, 'projectionName' | 'module'>,
): Promise<void> {
  const data = withProjectionFailureKey({
    projectionName: REWARDS_ENTITLEMENTS_PROJECTION,
    module: 'rewards',
    ...input,
  });
  await prisma.projectionFailure.upsert({
    where: { failureKey: data.failureKey },
    create: data,
    update: { ...data, resolved: false, resolvedAt: null },
  });
}

// --- helpers ---------------------------------------------------------------

function attributesToRecord(attributesJson: unknown): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const entry of readArray(attributesJson) ?? []) {
    const record = asRecord(entry);
    const key = readString(record.key);
    if (key !== undefined) out[key] = readString(record.value);
  }
  return out;
}

function extractNextKey(raw: unknown): string | undefined {
  const pagination = asRecord(asRecord(raw).pagination);
  const key = readString(pagination.next_key) ?? readString(pagination.nextKey);
  return key && key.length > 0 ? key : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseBigInt(value: string | undefined): bigint | undefined {
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined;
  return BigInt(value.trim());
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
