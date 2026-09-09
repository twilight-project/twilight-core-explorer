// The §8 states vocabulary for settlements: every cell renders a state, never a blank.
// "Late" is a client-side judgment — an OPEN settlement that has been open longer than the
// slot's own p90 finalization latency. The server reports observations only.

import type { SettlementStatusResponse } from './api/queries';

export type SettlementStatusRow = SettlementStatusResponse['data'][number];
export type SettlementSlotSummary = SettlementStatusResponse['slots'][number];

export type SettlementState = 'settled' | 'open' | 'late' | 'unknown';

export function deriveSettlementState(
  row: SettlementStatusRow,
  slot: SettlementSlotSummary | undefined,
): SettlementState {
  if (row.settled) return 'settled';
  if (row.epochCloseHeight === null || row.openForBlocks === null) return 'unknown';
  const p90 = slot?.p90LatencyBlocks;
  if (p90 != null && BigInt(row.openForBlocks) > BigInt(p90)) return 'late';
  return 'open';
}

export const SETTLEMENT_STATE_TONE: Record<SettlementState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  settled: 'success',
  open: 'warning',
  late: 'danger',
  unknown: 'neutral',
};
