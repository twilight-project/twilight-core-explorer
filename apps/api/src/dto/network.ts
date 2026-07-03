import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { HeightString, Nullable } from './common.js';
import { bigToString } from '../lib/serialize.js';

// ---- proposer leaderboard ----

export const ProposerLeaderboardItem = Type.Object(
  {
    slotId: HeightString,
    operatorAddress: Nullable(Type.String()),
    blocksProposed: Type.Integer(),
  },
  { $id: 'ProposerLeaderboardItem' },
);
export const ProposerLeaderboardResponse = Type.Object(
  { data: Type.Array(ProposerLeaderboardItem) },
  { $id: 'ProposerLeaderboardResponse' },
);

// ---- validator set at height ----

export const ValidatorSetMember = Type.Object(
  {
    slotId: HeightString,
    consensusAddress: Type.String(),
    operatorAddress: Nullable(Type.String()),
    consensusPower: Nullable(HeightString),
    effectiveFromHeight: HeightString,
    effectiveToHeight: Nullable(HeightString),
  },
  { $id: 'ValidatorSetMember' },
);
export const ValidatorSetResponse = Type.Object(
  { data: Type.Array(ValidatorSetMember) },
  { $id: 'ValidatorSetResponse' },
);
export const ValidatorSetQuery = Type.Object(
  { height: Type.String({ pattern: '^\\d+$' }) },
  { additionalProperties: false },
);

// ---- network liveness risk ----

export const NetworkRiskDto = Type.Object(
  {
    haltRiskLevel: Type.String(),
    haltRiskReason: Nullable(Type.String()),
    latestCommittedHeight: Nullable(HeightString),
    activeSlotCount: Type.Integer(),
    healthySlotCount: Type.Integer(),
    degradedSlotCount: Type.Integer(),
    downSlotCount: Type.Integer(),
    incompleteSlotCount: Type.Integer(),
    unknownSlotCount: Type.Integer(),
    availableSlotCount: Type.Integer(),
    unavailableSlotCount: Type.Integer(),
    availablePowerBps: Nullable(Type.Integer()),
    unavailablePowerBps: Nullable(Type.Integer()),
    policyVersion: Type.String(),
  },
  { $id: 'NetworkRisk' },
);
export const NetworkRiskResponse = Type.Object({ data: NetworkRiskDto }, { $id: 'NetworkRiskResponse' });

// ---- mappers ----

export function toProposerLeaderboardItem(row: {
  slotId: bigint;
  operatorAddress: string | null;
  blocksProposed: number;
}): Static<typeof ProposerLeaderboardItem> {
  return {
    slotId: row.slotId.toString(),
    operatorAddress: row.operatorAddress,
    blocksProposed: row.blocksProposed,
  };
}

export interface ValidatorWindowRow {
  slotId: bigint;
  consensusAddress: string;
  operatorAddress: string | null;
  consensusPower: bigint | null;
  effectiveFromHeight: bigint;
  effectiveToHeight: bigint | null;
}

export function toValidatorSetMember(row: ValidatorWindowRow): Static<typeof ValidatorSetMember> {
  return {
    slotId: row.slotId.toString(),
    consensusAddress: row.consensusAddress,
    operatorAddress: row.operatorAddress,
    consensusPower: bigToString(row.consensusPower),
    effectiveFromHeight: row.effectiveFromHeight.toString(),
    effectiveToHeight: bigToString(row.effectiveToHeight),
  };
}

export interface NetworkRiskRow {
  haltRiskLevel: string;
  haltRiskReason: string | null;
  latestCommittedHeight: bigint | null;
  activeSlotCount: number;
  healthySlotCount: number;
  degradedSlotCount: number;
  downSlotCount: number;
  incompleteSlotCount: number;
  unknownSlotCount: number;
  availableSlotCount: number;
  unavailableSlotCount: number;
  availablePowerBps: number | null;
  unavailablePowerBps: number | null;
  policyVersion: string;
}

export function toNetworkRisk(row: NetworkRiskRow): Static<typeof NetworkRiskDto> {
  return {
    haltRiskLevel: row.haltRiskLevel,
    haltRiskReason: row.haltRiskReason,
    latestCommittedHeight: bigToString(row.latestCommittedHeight),
    activeSlotCount: row.activeSlotCount,
    healthySlotCount: row.healthySlotCount,
    degradedSlotCount: row.degradedSlotCount,
    downSlotCount: row.downSlotCount,
    incompleteSlotCount: row.incompleteSlotCount,
    unknownSlotCount: row.unknownSlotCount,
    availableSlotCount: row.availableSlotCount,
    unavailableSlotCount: row.unavailableSlotCount,
    availablePowerBps: row.availablePowerBps,
    unavailablePowerBps: row.unavailablePowerBps,
    policyVersion: row.policyVersion,
  };
}

// ---- signing heatmap (per-slot signed/missed over the last N committed blocks) ----

export const SigningHeatmapQuery = Type.Object(
  { window: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 48 })) },
  { additionalProperties: false },
);

// A heatmap cell: the slot's status at a committed height, or null where it had no evidence there.
const CellStatus = Nullable(Type.Union([Type.Literal('signed'), Type.Literal('missed')]));

export const SigningHeatmapSlot = Type.Object({
  slotId: HeightString,
  operatorAddress: Nullable(Type.String()),
  consensusAddress: Nullable(Type.String()),
  signed: Type.Integer(),
  missed: Type.Integer(),
  // Aligned index-for-index to the top-level `heights`.
  cells: Type.Array(CellStatus),
});

export const SigningHeatmap = Type.Object(
  {
    window: Type.Integer(),
    blocksInWindow: Type.Integer(),
    fromHeight: Nullable(HeightString),
    toHeight: Nullable(HeightString),
    heights: Type.Array(HeightString),
    slots: Type.Array(SigningHeatmapSlot),
  },
  { $id: 'SigningHeatmap' },
);

export const SigningHeatmapResponse = Type.Object(
  { data: SigningHeatmap },
  { $id: 'SigningHeatmapResponse' },
);

export interface LivenessEvidenceRow {
  committedBlockHeight: bigint;
  slotId: bigint; // non-null in the Prisma schema (CoreSlotLivenessEvidence.slotId)
  operatorAddress: string | null;
  consensusAddress: string | null;
  status: string;
}

/**
 * Build the heatmap grid from the window's distinct heights (desc) + the per-slot evidence rows.
 * Columns are heights ascending; each slot gets a `cells` array aligned to those columns
 * ('signed'/'missed'/null). Rows without a slotId are skipped. All heights are strings.
 */
export function toSigningHeatmap(
  window: number,
  heightsDesc: bigint[],
  rows: LivenessEvidenceRow[],
): Static<typeof SigningHeatmap> {
  const heightsAsc = [...heightsDesc].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const heightStrs = heightsAsc.map((h) => h.toString());
  const colIndex = new Map(heightStrs.map((h, i) => [h, i] as const));

  type Cell = 'signed' | 'missed' | null;
  interface SlotAcc {
    slotId: string;
    operatorAddress: string | null;
    consensusAddress: string | null;
    cells: Cell[];
    signed: number;
    missed: number;
  }
  const bySlot = new Map<string, SlotAcc>();

  for (const r of rows) {
    const ci = colIndex.get(r.committedBlockHeight.toString());
    if (ci === undefined) continue; // height not in the window
    // Narrow the stored status to the two real values; anything else is treated as no-evidence.
    const cell: Cell = r.status === 'signed' ? 'signed' : r.status === 'missed' ? 'missed' : null;
    const key = r.slotId.toString();
    let slot = bySlot.get(key);
    if (!slot) {
      slot = {
        slotId: key,
        operatorAddress: r.operatorAddress,
        consensusAddress: r.consensusAddress,
        cells: heightStrs.map((): Cell => null),
        signed: 0,
        missed: 0,
      };
      bySlot.set(key, slot);
    }
    slot.cells[ci] = cell;
    if (cell === 'signed') slot.signed += 1;
    else if (cell === 'missed') slot.missed += 1;
    if (slot.operatorAddress === null && r.operatorAddress !== null) {
      slot.operatorAddress = r.operatorAddress;
    }
    if (slot.consensusAddress === null && r.consensusAddress !== null) {
      slot.consensusAddress = r.consensusAddress;
    }
  }

  const slots = [...bySlot.values()].sort((a, b) => {
    const aa = BigInt(a.slotId);
    const bb = BigInt(b.slotId);
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  });

  return {
    window,
    blocksInWindow: heightStrs.length,
    fromHeight: heightStrs[0] ?? null,
    toHeight: heightStrs[heightStrs.length - 1] ?? null,
    heights: heightStrs,
    slots,
  };
}
