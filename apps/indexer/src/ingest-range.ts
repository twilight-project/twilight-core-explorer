import { updateCursorSuccess } from './cursor.js';
import { ingestHeight, type IngestPrisma } from './ingest-height.js';
import type { RestRpcChainClient } from '@twilight-explorer/chain-client';

/**
 * Bounded-concurrency range ingestion.
 *
 * Heights are independent to FETCH but the cursor is a contiguous watermark: readers take
 * `lastIndexedHeight` to mean "every height at or below this is fully indexed". So we may
 * ingest a window of heights in parallel, but the watermark may only advance across the
 * completed CONTIGUOUS PREFIX of that window — never past a hole.
 *
 * Why this exists: ingestion was strictly sequential, and against a remote node each height
 * costs a round trip. On devnet-2 (84k blocks, ~0.5 s RTT) that is ~35 h of backfill. With
 * in-height batching plus a window here it is ~1 h.
 *
 * Failure semantics are preserved: the first height that throws aborts the range, and the
 * watermark is left at the last contiguous success BEFORE it, so the next tick resumes exactly
 * there and re-attempts the failed height. In-flight heights ahead of a failure may already
 * have been written; that is safe because per-height ingestion is idempotent (upserts keyed by
 * height / hash / eventKey), and the watermark never claims them.
 */
export const DEFAULT_INGEST_CONCURRENCY = 12;

export interface IngestRangeArgs {
  chainId: string;
  startHeight: bigint;
  endHeight: bigint;
  latestChainHeight: bigint;
  client: RestRpcChainClient;
  prisma: IngestPrisma;
  concurrency?: number;
}

export interface IngestRangeResult {
  /** Highest height whose entire prefix from startHeight succeeded. */
  lastContiguousHeight: bigint | null;
  heightsIngested: number;
}

export async function ingestRange(args: IngestRangeArgs): Promise<IngestRangeResult> {
  const { chainId, startHeight, endHeight, latestChainHeight, client, prisma } = args;
  const concurrency = Math.max(1, args.concurrency ?? DEFAULT_INGEST_CONCURRENCY);

  let next = startHeight;
  let heightsIngested = 0;
  let lastContiguousHeight: bigint | null = null;
  // Heights that finished out of order, waiting for their predecessor to land before the
  // watermark can move over them.
  const completedAhead = new Set<bigint>();
  const hashByHeight = new Map<bigint, string | undefined>();
  let firstError: unknown;
  let failedHeight: bigint | null = null;

  const advanceWatermark = (): void => {
    let candidate = lastContiguousHeight === null ? startHeight : lastContiguousHeight + 1n;
    while (completedAhead.has(candidate)) {
      completedAhead.delete(candidate);
      lastContiguousHeight = candidate;
      candidate += 1n;
    }
  };

  async function worker(): Promise<void> {
    for (;;) {
      if (firstError !== undefined) return;
      const height = next;
      if (height > endHeight) return;
      // Claim the height before awaiting so no two workers take the same one.
      next += 1n;

      try {
        const result = await ingestHeight({
          chainId,
          height,
          latestChainHeight,
          client,
          prisma,
          // The range owns the watermark; a height must not stamp it out of order.
          skipCursorUpdate: true,
        });
        heightsIngested += 1;
        completedAhead.add(height);
        hashByHeight.set(height, result.blockHash);

        const before = lastContiguousHeight;
        advanceWatermark();
        if (lastContiguousHeight !== null && lastContiguousHeight !== before) {
          await updateCursorSuccess(
            prisma,
            chainId,
            lastContiguousHeight,
            hashByHeight.get(lastContiguousHeight),
            latestChainHeight,
          );
          for (const h of hashByHeight.keys()) {
            if (h <= lastContiguousHeight) hashByHeight.delete(h);
          }
        }
      } catch (error) {
        // Keep the FIRST failure by height, so the reported boundary is deterministic
        // regardless of which worker lost the race.
        if (firstError === undefined || (failedHeight !== null && height < failedHeight)) {
          firstError = error;
          failedHeight = height;
        }
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (firstError !== undefined) {
    // Nothing at or above the failure is claimed by the watermark: heights beyond it that did
    // land are simply re-ingested next tick (idempotent).
    if (failedHeight !== null && lastContiguousHeight !== null && lastContiguousHeight >= failedHeight) {
      lastContiguousHeight = failedHeight - 1n >= startHeight ? failedHeight - 1n : null;
    }
    throw firstError;
  }

  return { lastContiguousHeight, heightsIngested };
}
