import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { BlockProposerDto, HeightString, Nullable, PageInfoSchema } from './common.js';
import { bigToString, toIso } from '../lib/serialize.js';

export const BlockListItem = Type.Object(
  {
    height: HeightString,
    hash: Nullable(Type.String()),
    time: Nullable(Type.String()),
    txCount: Type.Integer(),
    chainId: Nullable(Type.String()),
    proposer: BlockProposerDto,
  },
  { $id: 'BlockListItem' },
);

export const BlockDetail = Type.Object(
  {
    height: HeightString,
    hash: Nullable(Type.String()),
    time: Nullable(Type.String()),
    txCount: Type.Integer(),
    chainId: Nullable(Type.String()),
    proposer: BlockProposerDto,
    appHash: Nullable(Type.String()),
    validatorsHash: Nullable(Type.String()),
    nextValidatorsHash: Nullable(Type.String()),
    lastBlockHash: Nullable(Type.String()),
    createdAt: Type.String(),
    raw: Type.Optional(Type.Unknown()),
  },
  { $id: 'BlockDetail' },
);

export const BlockListResponse = Type.Object(
  { data: Type.Array(BlockListItem), page: PageInfoSchema },
  { $id: 'BlockListResponse' },
);

export const BlockDetailResponse = Type.Object(
  { data: BlockDetail },
  { $id: 'BlockDetailResponse' },
);

export const BlocksQuery = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
    cursor: Type.Optional(Type.String()),
  },
  { additionalProperties: false }, // any unknown query param (e.g. include=raw) -> 400 invalid_query
);

// No pattern here on purpose: the handler validates the height itself so a non-numeric value
// returns the specific `invalid_height` code rather than a generic schema `invalid_query`.
export const BlockParams = Type.Object({
  height: Type.String(),
});

export const BlockDetailQuery = Type.Object(
  { include: Type.Optional(Type.Literal('raw')) },
  { additionalProperties: false },
);

// ----- blocks aggregate (windowed stats over the last N canonical blocks) -----

export const BlocksAggregateQuery = Type.Object(
  { window: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000, default: 1000 })) },
  { additionalProperties: false },
);

export const BlocksAggregate = Type.Object(
  {
    window: Type.Integer({ description: 'Effective block-count window requested.' }),
    blocksInWindow: Type.Integer({ description: 'Actual blocks counted (< window on a young chain).' }),
    fromHeight: Nullable(HeightString),
    toHeight: Nullable(HeightString),
    spanSeconds: Nullable(Type.Number()),
    avgBlockTimeSeconds: Nullable(Type.Number({ description: 'Null when < 2 timed blocks.' })),
    avgTxsPerBlock: Nullable(Type.Number()),
    blocksPerDay: Nullable(
      Type.Number({ description: 'Projected from avg cadence (86400 / avgBlockTime).' }),
    ),
    uniqueProposers: Type.Integer({
      description: 'Distinct attributed CoreSlots (+2-correct) in the window.',
    }),
    totalTxs: Type.Integer(),
  },
  { $id: 'BlocksAggregate' },
);

export const BlocksAggregateResponse = Type.Object(
  { data: BlocksAggregate },
  { $id: 'BlocksAggregateResponse' },
);

// ----- row shapes + mappers -----

export interface BlockRow {
  height: bigint;
  hash: string | null;
  time: Date | null;
  chainId: string | null;
  proposerAddress: string | null;
  appHash: string | null;
  validatorsHash: string | null;
  nextValidatorsHash: string | null;
  lastBlockHash: string | null;
  txCount: number;
  rawJson: unknown;
  createdAt: Date;
}

export interface ProposerAttributionRow {
  height: bigint;
  proposerAddress: string | null;
  rawProposerAddress: string | null;
  slotId: bigint | null;
  operatorAddress: string | null;
  attributionStatus: string;
}

type ProposerDto = Static<typeof BlockProposerDto>;

/** Build the proposer DTO from the block plus an OPTIONAL materialized attribution row. When the
 *  attribution is absent the block's own proposer address is surfaced and attributionStatus is null
 *  (unknown). The API never runs the proposer projection. */
export function toProposerDto(block: BlockRow, attribution: ProposerAttributionRow | null): ProposerDto {
  if (attribution) {
    return {
      rawAddress: attribution.rawProposerAddress ?? block.proposerAddress,
      address: attribution.proposerAddress,
      slotId: bigToString(attribution.slotId),
      operatorAddress: attribution.operatorAddress,
      attributionStatus: attribution.attributionStatus,
    };
  }
  return {
    rawAddress: block.proposerAddress,
    address: block.proposerAddress ? block.proposerAddress.toLowerCase() : null,
    slotId: null,
    operatorAddress: null,
    attributionStatus: null,
  };
}

export function toBlockListItem(
  block: BlockRow,
  attribution: ProposerAttributionRow | null,
): Static<typeof BlockListItem> {
  return {
    height: block.height.toString(),
    hash: block.hash,
    time: toIso(block.time),
    txCount: block.txCount,
    chainId: block.chainId,
    proposer: toProposerDto(block, attribution),
  };
}

export function toBlockDetail(
  block: BlockRow,
  attribution: ProposerAttributionRow | null,
  includeRaw: boolean,
): Static<typeof BlockDetail> {
  const detail: Static<typeof BlockDetail> = {
    height: block.height.toString(),
    hash: block.hash,
    time: toIso(block.time),
    txCount: block.txCount,
    chainId: block.chainId,
    proposer: toProposerDto(block, attribution),
    appHash: block.appHash,
    validatorsHash: block.validatorsHash,
    nextValidatorsHash: block.nextValidatorsHash,
    lastBlockHash: block.lastBlockHash,
    createdAt: toIso(block.createdAt) ?? '',
  };
  if (includeRaw) {
    detail.raw = block.rawJson;
  }
  return detail;
}

/** Thin row the aggregate needs (Prisma `select`). */
export interface AggregateBlockRow {
  height: bigint;
  time: Date | null;
  txCount: number;
}

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Compute windowed block stats from canonical rows. Avg block time is the mean of consecutive
 * positive time deltas (guards clock skew/reorgs and null-time blocks); blocks/day is projected from
 * that cadence. `uniqueProposers` counts distinct attributed CoreSlot ids (+2-correct, key-rotation
 * safe) over the same window. Uncomputable metrics are null — never a guessed 0.
 */
export function toBlocksAggregate(
  window: number,
  blocks: AggregateBlockRow[],
  attributions: Pick<ProposerAttributionRow, 'slotId'>[],
): Static<typeof BlocksAggregate> {
  const blocksInWindow = blocks.length;

  const uniqueProposers = new Set(
    attributions
      .map((a) => a.slotId)
      .filter((s): s is bigint => s !== null)
      .map((s) => s.toString()),
  ).size;

  let minHeight: bigint | null = null;
  let maxHeight: bigint | null = null;
  let minTime: Date | null = null;
  let maxTime: Date | null = null;
  let totalTxs = 0;
  for (const b of blocks) {
    totalTxs += b.txCount;
    if (minHeight === null || b.height < minHeight) {
      minHeight = b.height;
      minTime = b.time;
    }
    if (maxHeight === null || b.height > maxHeight) {
      maxHeight = b.height;
      maxTime = b.time;
    }
  }

  // Consecutive positive intervals over height-ascending order; only between blocks that BOTH carry a
  // time (a null-time block breaks the chain rather than bridging a gap).
  const byHeightAsc = [...blocks].sort((a, b) =>
    a.height < b.height ? -1 : a.height > b.height ? 1 : 0,
  );
  let prevTime: Date | null = null;
  let intervalSum = 0;
  let intervalCount = 0;
  for (const b of byHeightAsc) {
    if (prevTime !== null && b.time !== null) {
      const delta = (b.time.getTime() - prevTime.getTime()) / 1000;
      if (delta > 0) {
        intervalSum += delta;
        intervalCount += 1;
      }
    }
    prevTime = b.time;
  }

  const avgBlockTimeSeconds = intervalCount > 0 ? round(intervalSum / intervalCount, 3) : null;
  const avgTxsPerBlock = blocksInWindow > 0 ? round(totalTxs / blocksInWindow, 2) : null;
  const blocksPerDay =
    avgBlockTimeSeconds !== null && avgBlockTimeSeconds > 0
      ? Math.round(86400 / avgBlockTimeSeconds)
      : null;
  const spanSeconds =
    minTime !== null && maxTime !== null
      ? round((maxTime.getTime() - minTime.getTime()) / 1000, 3)
      : null;

  return {
    window,
    blocksInWindow,
    fromHeight: minHeight !== null ? minHeight.toString() : null,
    toHeight: maxHeight !== null ? maxHeight.toString() : null,
    spanSeconds,
    avgBlockTimeSeconds,
    avgTxsPerBlock,
    blocksPerDay,
    uniqueProposers,
    totalTxs,
  };
}
