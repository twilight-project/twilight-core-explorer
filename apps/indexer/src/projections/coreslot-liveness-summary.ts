import {
  haltProjectionCursorError,
  updateProjectionCursorSuccess,
  type ProjectionCursorPrisma,
} from './cursor.js';
import {
  CORESLOT_LIVENESS_MISS_CAUSE,
  CORESLOT_LIVENESS_PROJECTION,
  CORESLOT_LIVENESS_RECENT_WINDOWS,
  CORESLOT_LIVENESS_STATUS,
  CORESLOT_LIVENESS_SUMMARY_PROJECTION,
  CORESLOT_LIVENESS_SUMMARY_STATUS,
  CORESLOT_LIVENESS_WINDOW_KIND,
  type ProjectionFailureInput,
  withProjectionFailureKey,
} from './types.js';

export interface ProjectCoreSlotLivenessSummaryArgs {
  prisma: CoreSlotLivenessSummaryProjectionPrisma;
  chainId: string;
  endHeight?: bigint | undefined;
  /** Rows per evidence read; exposed for tests to exercise chunk boundaries. */
  chunkSize?: number | undefined;
}

export interface ProjectCoreSlotLivenessSummaryResult {
  slotsSummarized: number;
  rowsWritten: number;
  failuresCreated: number;
  maxCommittedHeight: bigint;
}

export interface CoreSlotLivenessSummaryProjectionPrisma extends ProjectionCursorPrisma {
  coreSlotLivenessEvidence: {
    findMany(args: unknown): Promise<EvidenceSource[]>;
  };
  coreSlotLivenessSummary: {
    deleteMany(args?: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
  projectionFailure: {
    findMany(args: unknown): Promise<FailureHeightSource[]>;
    upsert(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  $transaction<T>(
    fn: (tx: CoreSlotLivenessSummaryProjectionPrisma) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T>;
}

interface EvidenceSource {
  committedBlockHeight: bigint;
  slotId: bigint;
  status: string;
  missCause: string | null;
  operatorAddress: string | null;
  consensusAddress: string | null;
  consensusWindowId: bigint | null;
}

interface FailureHeightSource {
  committedHeight: bigint | null;
}

interface WindowSpec {
  windowKind: string;
  windowSize: number | null;
}

const WINDOW_SPECS: WindowSpec[] = [
  { windowKind: CORESLOT_LIVENESS_WINDOW_KIND.lifetime, windowSize: null },
  ...CORESLOT_LIVENESS_RECENT_WINDOWS.map((w) => ({ windowKind: w.kind, windowSize: w.size })),
];

// The largest recent window bounds the per-slot row buffer the streaming read must retain.
const MAX_RECENT_WINDOW = Math.max(...CORESLOT_LIVENESS_RECENT_WINDOWS.map((w) => w.size));
const DEFAULT_EVIDENCE_CHUNK_SIZE = 25_000;

// Per-slot accumulator for one streaming pass over evidence (slotId asc, height asc). Lifetime
// aggregates are O(1) scalars; recent windows need only the trailing MAX_RECENT_WINDOW rows,
// kept in a circular buffer.
interface SlotStreamState {
  slotId: bigint;
  signedCount: number;
  absentMissedCount: number;
  nilMissedCount: number;
  evidenceCount: number;
  firstHeight: bigint | null;
  lastRow: EvidenceSource | null;
  lastStatus: string | null;
  trailingRun: number;
  latestMissedHeight: bigint | null;
  ring: EvidenceSource[];
  ringPos: number;
  ringCount: number;
  violation: { committedHeight: bigint; error: string } | null;
}

export async function projectCoreSlotLivenessSummary(
  args: ProjectCoreSlotLivenessSummaryArgs,
): Promise<ProjectCoreSlotLivenessSummaryResult> {
  const { prisma, chainId, endHeight } = args;
  const chunkSize = args.chunkSize ?? DEFAULT_EVIDENCE_CHUNK_SIZE;

  try {
    // ── Read phase: NO interactive transaction. Evidence rows are append-only and immutable
    // (the 8c-1 projector only ever appends below its own cursor), so chunked reads bounded by
    // a fixed upper height are a consistent snapshot — and the multi-minute full-table read no
    // longer has to fit inside a Prisma transaction timeout (the devnet halted_error failure
    // mode once history passed ~1M evidence rows).
    const upperBound = endHeight ?? await latestEvidenceHeight(prisma);
    const heightFilter = upperBound === null ? {} : { committedBlockHeight: { lte: upperBound } };

    // Exact invalid committed heights from the upstream liveness projection (8c-1 stamps these).
    const failures = await prisma.projectionFailure.findMany({
      where: {
        projectionName: CORESLOT_LIVENESS_PROJECTION,
        resolved: false,
        committedHeight: endHeight === undefined
          ? { not: null }
          : { lte: endHeight, not: null },
      },
      select: { committedHeight: true },
    });
    const invalidHeights = dedupeSortedHeights(failures);

    const states = new Map<string, SlotStreamState>();
    let cursorAfter: { slotId: bigint; committedBlockHeight: bigint } | null = null;
    for (;;) {
      const afterFilter = cursorAfter === null
        ? {}
        : {
            OR: [
              { slotId: { gt: cursorAfter.slotId } },
              { slotId: cursorAfter.slotId, committedBlockHeight: { gt: cursorAfter.committedBlockHeight } },
            ],
          };
      const chunk = await prisma.coreSlotLivenessEvidence.findMany({
        where: { ...heightFilter, ...afterFilter },
        orderBy: [{ slotId: 'asc' }, { committedBlockHeight: 'asc' }],
        take: chunkSize,
      });
      for (const row of chunk) feedSlotState(states, row);
      const tail = chunk[chunk.length - 1];
      if (!tail || chunk.length < chunkSize) break;
      cursorAfter = { slotId: tail.slotId, committedBlockHeight: tail.committedBlockHeight };
    }

    // ── Assemble summaries + failures from the streamed states (pure compute).
    const summaryRows: Record<string, unknown>[] = [];
    const violationFailures: Array<Omit<ProjectionFailureInput, 'projectionName' | 'module'>> = [];
    let maxCommittedHeight = 0n;
    for (const state of states.values()) {
      const last = state.lastRow;
      if (!last) continue;
      if (last.committedBlockHeight > maxCommittedHeight) maxCommittedHeight = last.committedBlockHeight;

      if (state.violation) {
        violationFailures.push({
          sourceHeight: last.committedBlockHeight,
          committedHeight: state.violation.committedHeight,
          failureKind: 'liveness_summary_invariant_violation',
          error: state.violation.error,
        });
        continue; // do not emit summaries for a slot with corrupt evidence
      }

      const recentRows = materializeRing(state);
      for (const spec of WINDOW_SPECS) {
        if (spec.windowSize === null) {
          summaryRows.push(buildLifetimeSummaryFromState(state, invalidHeights));
        } else {
          const windowRows = recentRows.slice(Math.max(0, recentRows.length - spec.windowSize));
          summaryRows.push(buildSummary(state.slotId, spec, windowRows, invalidHeights));
        }
      }
    }

    // ── Write phase: ONE short transaction — delete-and-replace summaries, refresh failures,
    // advance the cursor. Bounded work (a few hundred rows), so the default-ish timeout holds.
    const cursorHeight = endHeight ?? maxCommittedHeight;
    await prisma.$transaction(async (tx) => {
      // Clear this projection's prior unresolved failures; re-created below if still bad.
      await tx.projectionFailure.deleteMany({
        where: { projectionName: CORESLOT_LIVENESS_SUMMARY_PROJECTION, resolved: false },
      });
      for (const failure of violationFailures) {
        await createFailure(tx, failure);
      }
      await tx.coreSlotLivenessSummary.deleteMany();
      if (summaryRows.length > 0) {
        await tx.coreSlotLivenessSummary.createMany({ data: summaryRows });
      }
      await updateProjectionCursorSuccess(
        tx,
        CORESLOT_LIVENESS_SUMMARY_PROJECTION,
        chainId,
        cursorHeight,
      );
    }, { timeout: 30_000, maxWait: 15_000 });

    return {
      slotsSummarized: states.size,
      rowsWritten: summaryRows.length,
      failuresCreated: violationFailures.length,
      maxCommittedHeight,
    };
  } catch (error) {
    await haltProjectionCursorError(
      prisma,
      CORESLOT_LIVENESS_SUMMARY_PROJECTION,
      chainId,
      endHeight ?? 0n,
      error,
    );
    throw error;
  }
}

/** Highest evidence height at scan start — the fixed snapshot bound for the chunked read. */
async function latestEvidenceHeight(
  prisma: CoreSlotLivenessSummaryProjectionPrisma,
): Promise<bigint | null> {
  const rows = await prisma.coreSlotLivenessEvidence.findMany({
    orderBy: [{ committedBlockHeight: 'desc' }],
    take: 1,
  });
  const top = rows[0];
  return top ? top.committedBlockHeight : null;
}

function feedSlotState(states: Map<string, SlotStreamState>, row: EvidenceSource): void {
  const key = row.slotId.toString();
  let state = states.get(key);
  if (!state) {
    state = {
      slotId: row.slotId,
      signedCount: 0,
      absentMissedCount: 0,
      nilMissedCount: 0,
      evidenceCount: 0,
      firstHeight: null,
      lastRow: null,
      lastStatus: null,
      trailingRun: 0,
      latestMissedHeight: null,
      ring: new Array<EvidenceSource>(MAX_RECENT_WINDOW),
      ringPos: 0,
      ringCount: 0,
      violation: null,
    };
    states.set(key, state);
  }

  state.lastRow = row; // tracked even past a violation: maxCommittedHeight covers corrupt slots
  if (state.violation) return;

  const violation = rowShapeViolation(row);
  if (violation) {
    state.violation = violation;
    return;
  }

  if (row.status === CORESLOT_LIVENESS_STATUS.signed) state.signedCount += 1;
  else if (row.missCause === CORESLOT_LIVENESS_MISS_CAUSE.absent) state.absentMissedCount += 1;
  else if (row.missCause === CORESLOT_LIVENESS_MISS_CAUSE.nil) state.nilMissedCount += 1;
  state.evidenceCount += 1;
  if (state.firstHeight === null) state.firstHeight = row.committedBlockHeight;
  if (row.status === state.lastStatus) state.trailingRun += 1;
  else {
    state.lastStatus = row.status;
    state.trailingRun = 1;
  }
  if (row.status === CORESLOT_LIVENESS_STATUS.missed) {
    state.latestMissedHeight = row.committedBlockHeight;
  }
  state.ring[state.ringPos] = row;
  state.ringPos = (state.ringPos + 1) % MAX_RECENT_WINDOW;
  if (state.ringCount < MAX_RECENT_WINDOW) state.ringCount += 1;
}

/** The trailing rows in insertion order (oldest first), up to MAX_RECENT_WINDOW. */
function materializeRing(state: SlotStreamState): EvidenceSource[] {
  if (state.ringCount < MAX_RECENT_WINDOW) return state.ring.slice(0, state.ringCount);
  return [...state.ring.slice(state.ringPos), ...state.ring.slice(0, state.ringPos)];
}

// Mirrors buildSummary() for the lifetime window using the streamed O(1) aggregates. The
// chunk-equivalence test asserts this stays identical to buildSummary over the full row set.
function buildLifetimeSummaryFromState(
  state: SlotStreamState,
  invalidHeights: bigint[],
): Record<string, unknown> {
  const first = state.firstHeight;
  const last = state.lastRow ? state.lastRow.committedBlockHeight : null;
  const missedCount = state.absentMissedCount + state.nilMissedCount;
  const expectedCount = state.evidenceCount;
  const uptimeBps = expectedCount > 0
    ? Number((BigInt(state.signedCount) * 10000n) / BigInt(expectedCount))
    : null;
  const invalidHeightCount = first !== null && last !== null
    ? invalidHeights.filter((h) => h >= first && h <= last).length
    : 0;
  const signedTrailing = state.lastStatus === CORESLOT_LIVENESS_STATUS.signed;

  return {
    summaryKey: `${CORESLOT_LIVENESS_SUMMARY_PROJECTION}:${state.slotId}:${CORESLOT_LIVENESS_WINDOW_KIND.lifetime}`,
    slotId: state.slotId,
    windowKind: CORESLOT_LIVENESS_WINDOW_KIND.lifetime,
    windowSize: null,
    operatorAddress: state.lastRow ? state.lastRow.operatorAddress : null,
    consensusAddress: state.lastRow ? state.lastRow.consensusAddress : null,
    consensusWindowId: state.lastRow ? state.lastRow.consensusWindowId : null,
    firstCommittedHeight: first,
    lastCommittedHeight: last,
    spanHeightCount: first !== null && last !== null ? last - first + 1n : null,
    evidenceHeightCount: expectedCount,
    expectedCount,
    signedCount: state.signedCount,
    missedCount,
    absentMissedCount: state.absentMissedCount,
    nilMissedCount: state.nilMissedCount,
    uptimeBps,
    currentSignedStreak: signedTrailing ? state.trailingRun : 0,
    currentMissedStreak: signedTrailing || state.lastStatus === null ? 0 : state.trailingRun,
    latestMissedHeight: state.latestMissedHeight,
    invalidHeightCount,
    summaryStatus: invalidHeightCount > 0
      ? CORESLOT_LIVENESS_SUMMARY_STATUS.incomplete
      : CORESLOT_LIVENESS_SUMMARY_STATUS.complete,
  };
}

/** Single-row shape check — the streamed form of findInvariantViolation(). */
function rowShapeViolation(
  row: EvidenceSource,
): { committedHeight: bigint; error: string } | null {
  if (row.status === CORESLOT_LIVENESS_STATUS.signed) return null;
  if (row.status === CORESLOT_LIVENESS_STATUS.missed
      && (row.missCause === CORESLOT_LIVENESS_MISS_CAUSE.absent
        || row.missCause === CORESLOT_LIVENESS_MISS_CAUSE.nil)) {
    return null;
  }
  return {
    committedHeight: row.committedBlockHeight,
    error: `CoreSlotLivenessEvidence row at committed height ${row.committedBlockHeight} for slot `
      + `${row.slotId} has an unexpected (status=${row.status}, missCause=${row.missCause}) shape.`,
  };
}

function buildSummary(
  slotId: bigint,
  spec: WindowSpec,
  rows: EvidenceSource[],
  invalidHeights: bigint[],
): Record<string, unknown> {
  const evidenceHeightCount = rows.length;
  let signedCount = 0;
  let absentMissedCount = 0;
  let nilMissedCount = 0;
  for (const row of rows) {
    if (row.status === CORESLOT_LIVENESS_STATUS.signed) signedCount += 1;
    else if (row.missCause === CORESLOT_LIVENESS_MISS_CAUSE.absent) absentMissedCount += 1;
    else if (row.missCause === CORESLOT_LIVENESS_MISS_CAUSE.nil) nilMissedCount += 1;
  }
  const missedCount = absentMissedCount + nilMissedCount;
  const expectedCount = evidenceHeightCount;

  const firstRow = rows[0] ?? null;
  const latest = rows[rows.length - 1] ?? null;
  const first = firstRow ? firstRow.committedBlockHeight : null;
  const last = latest ? latest.committedBlockHeight : null;
  const spanHeightCount = first !== null && last !== null ? last - first + 1n : null;

  const uptimeBps = expectedCount > 0
    ? Number((BigInt(signedCount) * 10000n) / BigInt(expectedCount))
    : null;

  // Trailing run of the latest status (over present evidence rows).
  let currentSignedStreak = 0;
  let currentMissedStreak = 0;
  if (latest) {
    const lastStatus = latest.status;
    let streak = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      if (!row || row.status !== lastStatus) break;
      streak += 1;
    }
    if (lastStatus === CORESLOT_LIVENESS_STATUS.signed) currentSignedStreak = streak;
    else currentMissedStreak = streak;
  }

  let latestMissedHeight: bigint | null = null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row && row.status === CORESLOT_LIVENESS_STATUS.missed) {
      latestMissedHeight = row.committedBlockHeight;
      break;
    }
  }

  // Coverage flag: exact invalid committed heights inside the numeric span (NOT the row set).
  const invalidHeightCount = first !== null && last !== null
    ? invalidHeights.filter((h) => h >= first && h <= last).length
    : 0;
  const summaryStatus = invalidHeightCount > 0
    ? CORESLOT_LIVENESS_SUMMARY_STATUS.incomplete
    : CORESLOT_LIVENESS_SUMMARY_STATUS.complete;

  return {
    summaryKey: `${CORESLOT_LIVENESS_SUMMARY_PROJECTION}:${slotId}:${spec.windowKind}`,
    slotId,
    windowKind: spec.windowKind,
    windowSize: spec.windowSize,
    operatorAddress: latest ? latest.operatorAddress : null,
    consensusAddress: latest ? latest.consensusAddress : null,
    consensusWindowId: latest ? latest.consensusWindowId : null,
    firstCommittedHeight: first,
    lastCommittedHeight: last,
    spanHeightCount,
    evidenceHeightCount,
    expectedCount,
    signedCount,
    missedCount,
    absentMissedCount,
    nilMissedCount,
    uptimeBps,
    currentSignedStreak,
    currentMissedStreak,
    latestMissedHeight,
    invalidHeightCount,
    summaryStatus,
  };
}

function dedupeSortedHeights(failures: FailureHeightSource[]): bigint[] {
  const set = new Set<bigint>();
  for (const f of failures) {
    if (f.committedHeight !== null) set.add(f.committedHeight);
  }
  return [...set];
}

async function createFailure(
  prisma: Pick<CoreSlotLivenessSummaryProjectionPrisma, 'projectionFailure'>,
  input: Omit<ProjectionFailureInput, 'projectionName' | 'module'>,
): Promise<void> {
  const data = withProjectionFailureKey({
    projectionName: CORESLOT_LIVENESS_SUMMARY_PROJECTION,
    module: 'cometbft',
    ...input,
  });
  await prisma.projectionFailure.upsert({
    where: { failureKey: data.failureKey },
    create: data,
    update: { ...data, resolved: false, resolvedAt: null },
  });
}
