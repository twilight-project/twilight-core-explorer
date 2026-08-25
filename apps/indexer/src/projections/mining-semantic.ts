import {
  haltProjectionCursorError,
  updateProjectionCursorSuccess,
  type ProjectionCursorPrisma,
} from './cursor.js';
import {
  MINING_CHUNK_SUBMITTED_EVENT_TYPE,
  MINING_EVENT_TYPES,
  MINING_FINALIZE_SETTLEMENT_TYPE_URL,
  MINING_MESSAGE_TYPE_URLS,
  MINING_SEMANTIC_PROJECTION,
  MINING_SETTLEMENT_FINALIZED_EVENT_TYPE,
  MINING_SUBMIT_CHUNK_TYPE_URL,
  REWARDS_NATIVE_DENOM,
  withProjectionFailureKey,
  type ProjectionFailureInput,
} from './types.js';

/**
 * Rebuildable semantic projection for x/mining (projection mining_semantic_v1).
 *
 * x/mining settles reward entitlements: the slot's settlement address submits chunks of
 * participant payouts against a (slot, epoch) settlement, and finalizing it releases any
 * remainder to the operator's payout address.
 *
 * Only the two TX-BOUND events exist — x/mining's EndBlocker emits nothing at all, so
 * settlement *creation* is invisible here by design (that is the observed-sample projection
 * mining_settlement_state_v1's job). Everything this projector writes is derivable from
 * indexed generic rows, so it is fully rebuildable.
 *
 * Load-bearing detail: `mining_settlement_chunk_submitted` carries only AGGREGATES
 * (recipient_count, chunk_total). The individual payout lines exist only in the transaction
 * body, so they are read from the decoded MsgSubmitSettlementChunk and stored verbatim. A
 * chunk whose message cannot be correlated still produces a row (the event is authoritative
 * for the aggregates) but with payoutsJson null — never a guessed payout set.
 */
export interface ProjectMiningSemanticRangeArgs {
  prisma: MiningSemanticProjectionPrisma;
  chainId: string;
  startHeight: bigint;
  endHeight: bigint;
}

export interface ProjectMiningSemanticHeightArgs {
  prisma: MiningSemanticProjectionPrisma;
  chainId: string;
  height: bigint;
}

export interface ProjectMiningSemanticResult {
  height: bigint;
  rowsWritten: number;
  failuresCreated: number;
}

export interface MiningSemanticProjectionPrisma extends ProjectionCursorPrisma {
  explorerTransaction: { findMany(args: unknown): Promise<TransactionSource[]> };
  message: { findMany(args: unknown): Promise<MessageSource[]> };
  event: { findMany(args: unknown): Promise<EventSource[]> };
  miningSettlementChunk: { upsert(args: unknown): Promise<unknown> };
  miningSettlementFinalization: { upsert(args: unknown): Promise<unknown> };
  projectionFailure: {
    upsert(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: MiningSemanticProjectionPrisma) => Promise<T>): Promise<T>;
}

interface TransactionSource {
  hash: string;
  height: bigint;
  code: number | null;
  status: string;
}

interface MessageSource {
  id: bigint;
  txHash: string;
  height: bigint;
  msgIndex: number;
  typeUrl: string;
  decodedJson: unknown | null;
  rawJson: unknown | null;
}

interface EventSource {
  id: bigint;
  height: bigint;
  txHash: string | null;
  msgIndex: number | null;
  type: string;
  attributesJson: unknown;
}

interface Counters {
  rowsWritten: number;
  failuresCreated: number;
}

export async function projectMiningSemanticRange(
  args: ProjectMiningSemanticRangeArgs,
): Promise<ProjectMiningSemanticResult[]> {
  const results: ProjectMiningSemanticResult[] = [];
  for (let height = args.startHeight; height <= args.endHeight; height += 1n) {
    results.push(await projectMiningSemanticHeight({
      prisma: args.prisma,
      chainId: args.chainId,
      height,
    }));
  }
  return results;
}

export async function projectMiningSemanticHeight(
  args: ProjectMiningSemanticHeightArgs,
): Promise<ProjectMiningSemanticResult> {
  const { prisma, chainId, height } = args;

  try {
    return await prisma.$transaction(async (tx) => {
      // Clear this height's prior unresolved failures so a rerun re-derives them cleanly.
      await tx.projectionFailure.deleteMany({
        where: { projectionName: MINING_SEMANTIC_PROJECTION, sourceHeight: height, resolved: false },
      });

      const transactions = await tx.explorerTransaction.findMany({
        where: { height, OR: [{ status: 'success' }, { code: 0 }] },
        select: { hash: true, height: true, code: true, status: true },
      });
      const successfulTxHashes = new Set(transactions.map((t) => t.hash));

      const messages = successfulTxHashes.size === 0
        ? []
        : await tx.message.findMany({
            where: {
              height,
              txHash: { in: [...successfulTxHashes] },
              typeUrl: { in: [...MINING_MESSAGE_TYPE_URLS] },
            },
            orderBy: [{ txHash: 'asc' }, { msgIndex: 'asc' }],
          });

      // Both mining events are tx-bound, but load by type (not txHash) for consistency with
      // the other projectors, then drop anything bound to a failed tx.
      const events = await tx.event.findMany({
        where: { height, type: { in: [...MINING_EVENT_TYPES] } },
        orderBy: [{ id: 'asc' }],
      });

      const counters: Counters = { rowsWritten: 0, failuresCreated: 0 };

      for (const event of events) {
        if (isFailedTxBound(event, successfulTxHashes)) continue;
        if (event.type === MINING_CHUNK_SUBMITTED_EVENT_TYPE) {
          await projectChunkSubmitted(tx, { event, messages, counters });
        } else if (event.type === MINING_SETTLEMENT_FINALIZED_EVENT_TYPE) {
          await projectSettlementFinalized(tx, { event, messages, counters });
        }
      }

      await updateProjectionCursorSuccess(tx, MINING_SEMANTIC_PROJECTION, chainId, height);
      return { height, rowsWritten: counters.rowsWritten, failuresCreated: counters.failuresCreated };
    });
  } catch (error) {
    await haltProjectionCursorError(prisma, MINING_SEMANTIC_PROJECTION, chainId, height, error);
    throw error;
  }
}

async function projectChunkSubmitted(
  tx: MiningSemanticProjectionPrisma,
  args: { event: EventSource; messages: MessageSource[]; counters: Counters },
): Promise<void> {
  const { event, counters } = args;
  const attrs = attributesToRecord(event.attributesJson);

  const slotId = parseBigInt(attrs.slot_id);
  const epochNumber = parseBigInt(attrs.epoch);
  if (slotId === undefined || epochNumber === undefined) {
    await createFailure(tx, {
      sourceHeight: event.height,
      sourceEventId: event.id,
      eventType: event.type,
      failureKind: slotId === undefined ? 'invalid_slot_id' : 'invalid_epoch',
      rawEventJson: buildRawEventJson(event),
      error: `Invalid slot_id/epoch on ${event.type}: slot_id=${attrs.slot_id} epoch=${attrs.epoch}`,
    });
    counters.failuresCreated += 1;
    return;
  }

  const chunkIndex = parseBigInt(attrs.chunk_index);
  if (chunkIndex === undefined) {
    await createFailure(tx, {
      sourceHeight: event.height,
      sourceEventId: event.id,
      eventType: event.type,
      failureKind: 'invalid_chunk_index',
      rawEventJson: buildRawEventJson(event),
      error: `Invalid chunk_index on ${event.type}: ${attrs.chunk_index}`,
    });
    counters.failuresCreated += 1;
    return;
  }

  const message = correlateMessage(args.messages, event, MINING_SUBMIT_CHUNK_TYPE_URL);
  // The payout lines are NOT in the event — only in the tx body. Without a correlated message
  // they stay null rather than being invented.
  const decoded = message ? asRecord(message.decodedJson) : {};
  const payouts = readArray(decoded.payouts);

  await tx.miningSettlementChunk.upsert({
    where: { sourceEventId: event.id },
    create: {
      slotId,
      epochNumber,
      chunkIndex,
      nextChunkIndex: parseBigInt(attrs.next_chunk_index) ?? null,
      recipientCount: parseInt32(attrs.recipient_count),
      chunkTotal: attrs.chunk_total ?? null,
      // Twilight event amounts are bare integers with NO denom (unlike bank's "<n>utwlt").
      denom: REWARDS_NATIVE_DENOM,
      height: event.height,
      txHash: event.txHash ?? '',
      msgIndex: event.msgIndex,
      sourceEventId: event.id,
      sourceMessageId: message?.id ?? null,
      payoutsJson: payouts ?? undefined,
      rawEventJson: buildRawEventJson(event),
      rawMessageJson: message?.rawJson ?? undefined,
    },
    update: {
      nextChunkIndex: parseBigInt(attrs.next_chunk_index) ?? null,
      recipientCount: parseInt32(attrs.recipient_count),
      chunkTotal: attrs.chunk_total ?? null,
      sourceMessageId: message?.id ?? null,
      payoutsJson: payouts ?? undefined,
      rawEventJson: buildRawEventJson(event),
      rawMessageJson: message?.rawJson ?? undefined,
    },
  });
  counters.rowsWritten += 1;

  if (!message) {
    await createFailure(tx, {
      sourceHeight: event.height,
      sourceEventId: event.id,
      eventType: event.type,
      failureKind: 'missing_message',
      rawEventJson: buildRawEventJson(event),
      error:
        `${event.type} at height ${event.height} has no correlated ${MINING_SUBMIT_CHUNK_TYPE_URL} `
        + 'message; per-recipient payouts are unavailable (aggregates recorded from the event).',
    });
    counters.failuresCreated += 1;
  }
}

async function projectSettlementFinalized(
  tx: MiningSemanticProjectionPrisma,
  args: { event: EventSource; messages: MessageSource[]; counters: Counters },
): Promise<void> {
  const { event, counters } = args;
  const attrs = attributesToRecord(event.attributesJson);

  const slotId = parseBigInt(attrs.slot_id);
  const epochNumber = parseBigInt(attrs.epoch);
  if (slotId === undefined || epochNumber === undefined) {
    await createFailure(tx, {
      sourceHeight: event.height,
      sourceEventId: event.id,
      eventType: event.type,
      failureKind: slotId === undefined ? 'invalid_slot_id' : 'invalid_epoch',
      rawEventJson: buildRawEventJson(event),
      error: `Invalid slot_id/epoch on ${event.type}: slot_id=${attrs.slot_id} epoch=${attrs.epoch}`,
    });
    counters.failuresCreated += 1;
    return;
  }

  const message = correlateMessage(args.messages, event, MINING_FINALIZE_SETTLEMENT_TYPE_URL);

  await tx.miningSettlementFinalization.upsert({
    where: { sourceEventId: event.id },
    create: {
      slotId,
      epochNumber,
      // The chain emits the enum's .String() name; keep it verbatim rather than re-deriving it.
      finalizationReason: attrs.finalization_reason ?? null,
      releasedRemainder: attrs.released_remainder ?? null,
      denom: REWARDS_NATIVE_DENOM,
      finalizedHeight: parseBigInt(attrs.finalized_height) ?? null,
      height: event.height,
      txHash: event.txHash ?? '',
      msgIndex: event.msgIndex,
      sourceEventId: event.id,
      sourceMessageId: message?.id ?? null,
      rawEventJson: buildRawEventJson(event),
      rawMessageJson: message?.rawJson ?? undefined,
    },
    update: {
      finalizationReason: attrs.finalization_reason ?? null,
      releasedRemainder: attrs.released_remainder ?? null,
      finalizedHeight: parseBigInt(attrs.finalized_height) ?? null,
      sourceMessageId: message?.id ?? null,
      rawEventJson: buildRawEventJson(event),
      rawMessageJson: message?.rawJson ?? undefined,
    },
  });
  counters.rowsWritten += 1;
}

/**
 * Correlate an event to its message by (txHash, msgIndex) when the event carries a msgIndex,
 * else by txHash alone — but only when that is UNAMBIGUOUS. Two mining messages of the same
 * type in one tx with no msgIndex on the event is not resolvable, and guessing would attach
 * the wrong payout set, so it correlates to nothing.
 */
function correlateMessage(
  messages: MessageSource[],
  event: EventSource,
  typeUrl: string,
): MessageSource | undefined {
  if (!event.txHash) return undefined;
  const candidates = messages.filter((m) => m.txHash === event.txHash && m.typeUrl === typeUrl);
  if (candidates.length === 0) return undefined;
  if (event.msgIndex !== null) {
    return candidates.find((m) => m.msgIndex === event.msgIndex);
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

function isFailedTxBound(event: EventSource, successfulTxHashes: Set<string>): boolean {
  return event.txHash !== null && !successfulTxHashes.has(event.txHash);
}

async function createFailure(
  prisma: Pick<MiningSemanticProjectionPrisma, 'projectionFailure'>,
  input: Omit<ProjectionFailureInput, 'projectionName' | 'module'>,
): Promise<void> {
  const data = withProjectionFailureKey({
    projectionName: MINING_SEMANTIC_PROJECTION,
    module: 'mining',
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

function buildRawEventJson(event: EventSource): unknown {
  return { id: event.id.toString(), type: event.type, attributes: event.attributesJson };
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

function parseInt32(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}
