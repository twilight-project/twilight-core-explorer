// Vocabulary of the operator-status feed (twilight-operator-status-v1), rendered per the
// contract: each KNOWN identifier gets one fixed caption saying what happened (never who was
// at fault); an UNKNOWN identifier renders as itself, never folded into another bucket.

export const STATE_CAPTIONS: Record<string, string> = {
  OPEN: 'accepting observations',
  FROZEN: 'observation window closed',
  ALLOCATION_SEALED: 'allocation sealed — shares fixed',
  SETTLEMENT_RECONCILED: 'settled and reconciled on chain',
  NO_TARGET_EPOCH: 'no target epoch',
  NO_OPEN_TARGET: 'no open target',
};

export const NOT_ELIGIBLE_CAPTIONS: Record<string, string> = {
  NO_ACCEPTED_ENROLLMENT: 'not enrolled in time',
  PARTICIPATION_NOT_AUTHORIZED: 'not authorized to participate',
  NO_VERIFIED_ACTIVITY: 'no verified search activity in the epoch',
  NO_VALID_PAYOUT_DESTINATION: 'no valid payout address on file',
};

export const EXCLUDED_CAPTIONS: Record<string, string> = {
  NO_VALID_PAYOUT_DESTINATION: 'no valid payout address on file',
  EXCLUDED_BELOW_FLOOR: "admitting more would have pushed every share below the chain's floor",
  EVIDENCE_VERIFIED_AFTER_SEAL: 'evidence verified only after the epoch was sealed',
  NOT_SELECTED_IN_DRAW: 'not selected in the draw',
  NOT_SELECTED_NO_VALID_BEACON: "the draw's beacon was invalid, so nobody was selected",
};

export function reasonCaption(map: Record<string, string>, id: string): string {
  return map[id] ?? id; // unknown identifiers render as themselves
}

// ---- typed-ish accessors over the raw feed payloads (the API serves them verbatim) ------

export function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function feedString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function feedNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** counts.{not_eligible|excluded} → [id, count] pairs, zero-count buckets included. */
export function reasonEntries(v: unknown): [string, number][] {
  return Object.entries(asRecord(v)).flatMap(([k, x]) => {
    const n = feedNumber(x);
    return n === null ? [] : [[k, n] as [string, number]];
  });
}

/** A deadline object: { time?, height?, estimated? }. */
export function feedDeadline(v: unknown): { time: string | null; height: number | null; estimated: boolean } {
  const o = asRecord(v);
  return {
    time: feedString(o['time']),
    height: feedNumber(o['height']),
    estimated: o['estimated'] === true,
  };
}
