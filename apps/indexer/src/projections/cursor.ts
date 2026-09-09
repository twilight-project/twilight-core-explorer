import { PROJECTION_STATUS } from './types.js';

export interface ProjectionCursorPrisma {
  projectionCursor: {
    upsert(args: unknown): Promise<unknown>;
  };
}

export interface ProjectionCursorReadPrisma {
  projectionCursor: {
    findFirst(args: unknown): Promise<{ lastProjectedHeight: unknown } | null>;
  };
}

// Read another projection's cursor height (its lastProjectedHeight), or 0n if it has never run. Downstream
// projections use this to cap their endHeight at an UPSTREAM projection's progress, so they never process /
// attribute a height whose upstream rows (e.g. consensus windows produced by temporal-map) do not exist yet.
// That is the #56 / #59 bug class: outrun the upstream -> emit nothing / mis-attribute -> advance the cursor
// past it -> a permanent, silent gap. A missing upstream cursor reads as 0n, which stalls the downstream
// until the upstream has run.
export async function readProjectionCursorHeight(
  prisma: ProjectionCursorReadPrisma,
  projectionName: string,
  chainId: string,
): Promise<bigint> {
  const row = await prisma.projectionCursor.findFirst({ where: { projectionName, chainId } });
  return toCursorHeight(row?.lastProjectedHeight);
}

function toCursorHeight(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string' && value.trim()) return BigInt(value);
  return 0n;
}

export class ProjectionChainIdMismatchError extends Error {
  constructor(configured: string, indexed: string) {
    super(
      `Projection CHAIN_ID "${configured}" does not match the indexed chain "${indexed}". `
      + 'Refusing to run: projections would be written under the wrong chain. Set CHAIN_ID '
      + 'to the indexed chain, or wipe the database if the chain was redeployed.',
    );
    this.name = 'ProjectionChainIdMismatchError';
  }
}

/**
 * Projection counterpart to the ingest path's `assertChainIdMatches`.
 *
 * Only ingest verifies CHAIN_ID against the node; every projection CLI just reads
 * `CHAIN_ID ?? 'twilight-localnet-1'`. A wrong value there silently writes ProjectionCursor
 * rows under a chain that does not exist, and the projection appears to "never progress".
 * Ingest is the guarded authority, so compare against the chain it actually indexed.
 *
 * Tolerates a prisma stub without `indexerCursor` (the projection unit tests inject narrow
 * mocks) and an empty table (a fresh DB has not ingested anything yet).
 */
export async function assertProjectionChainId(
  prisma: unknown,
  chainId: string,
): Promise<void> {
  const client = prisma as {
    indexerCursor?: { findFirst?: (args: unknown) => Promise<{ chainId?: unknown } | null> };
  };
  if (typeof client.indexerCursor?.findFirst !== 'function') return;

  const row = await client.indexerCursor.findFirst({ orderBy: { updatedAt: 'desc' } });
  const indexed = row?.chainId;
  if (typeof indexed !== 'string' || indexed === '') return;
  if (indexed !== chainId) throw new ProjectionChainIdMismatchError(chainId, indexed);
}

export async function getOrCreateProjectionCursor(
  prisma: ProjectionCursorPrisma,
  projectionName: string,
  chainId: string,
): Promise<unknown> {
  await assertProjectionChainId(prisma, chainId);
  return prisma.projectionCursor.upsert({
    where: { projectionName_chainId: { projectionName, chainId } },
    create: {
      projectionName,
      chainId,
      lastProjectedHeight: 0n,
      status: PROJECTION_STATUS.idle,
    },
    update: {},
  });
}

export async function updateProjectionCursorSuccess(
  prisma: ProjectionCursorPrisma,
  projectionName: string,
  chainId: string,
  height: bigint,
): Promise<unknown> {
  return prisma.projectionCursor.upsert({
    where: { projectionName_chainId: { projectionName, chainId } },
    create: {
      projectionName,
      chainId,
      lastProjectedHeight: height,
      status: PROJECTION_STATUS.idle,
      error: null,
    },
    update: {
      lastProjectedHeight: height,
      status: PROJECTION_STATUS.idle,
      error: null,
    },
  });
}

export async function haltProjectionCursorError(
  prisma: ProjectionCursorPrisma,
  projectionName: string,
  chainId: string,
  height: bigint,
  error: unknown,
): Promise<unknown> {
  return prisma.projectionCursor.upsert({
    where: { projectionName_chainId: { projectionName, chainId } },
    create: {
      projectionName,
      chainId,
      lastProjectedHeight: previousHeight(height),
      status: PROJECTION_STATUS.haltedError,
      error: formatError(error),
    },
    update: {
      status: PROJECTION_STATUS.haltedError,
      error: formatError(error),
    },
  });
}

function previousHeight(height: bigint): bigint {
  return height > 0n ? height - 1n : 0n;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
