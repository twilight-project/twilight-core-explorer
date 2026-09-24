// Epoch-close ESTIMATE — the labelled stopgap until the 14b clock projector makes it
// authoritative. Sources are chain facts already indexed: consecutive reward-epoch close
// heights are exactly one epoch length apart, so the next close is last close + spacing, and
// the ETA is remaining blocks × observed average block time. Everything is BigInt-safe string
// math on heights; only the final small remainders become Numbers.

export interface EpochEtaInput {
  /** Two most recent closed epochs, newest first: their close heights + numbers. */
  epochs: { epochNumber: string; height: string }[];
  /** Latest indexed chain height. */
  headHeight: string | null | undefined;
  /** Observed mean seconds per block (from recent block timestamps). */
  avgBlockSeconds: number | null;
}

export interface EpochEta {
  /** The epoch currently open (last closed + 1). */
  epochNumber: string;
  closesAtHeight: string;
  remainingBlocks: number;
  /** Seconds to close, null when avg block time is unknown. */
  etaSeconds: number | null;
  /** 0..1 elapsed fraction of the open epoch. */
  progress: number;
  /** Always true — this is an estimate, and every rendering must say so. */
  estimated: true;
}

export function deriveEpochEta(input: EpochEtaInput): EpochEta | null {
  const [latest, previous] = input.epochs;
  if (!latest || !previous || !input.headHeight) return null;
  let lastClose: bigint;
  let prevClose: bigint;
  let head: bigint;
  try {
    lastClose = BigInt(latest.height);
    prevClose = BigInt(previous.height);
    head = BigInt(input.headHeight);
  } catch {
    return null;
  }
  const spacing = lastClose - prevClose;
  if (spacing <= 0n) return null;
  const closesAt = lastClose + spacing;
  const remaining = closesAt > head ? closesAt - head : 0n;
  // spacing is a small on-chain param (hundreds of blocks) — safe to Number.
  const spacingN = Number(spacing);
  const remainingN = Number(remaining);
  return {
    epochNumber: (BigInt(latest.epochNumber) + 1n).toString(),
    closesAtHeight: closesAt.toString(),
    remainingBlocks: remainingN,
    etaSeconds:
      input.avgBlockSeconds !== null && Number.isFinite(input.avgBlockSeconds)
        ? Math.round(remainingN * input.avgBlockSeconds)
        : null,
    progress: Math.min(1, Math.max(0, (spacingN - remainingN) / spacingN)),
    estimated: true,
  };
}

/** Mean seconds between block timestamps (newest-first list), null below 2 samples. */
export function averageBlockSeconds(times: (string | null)[]): number | null {
  const parsed = times
    .filter((t): t is string => t !== null)
    .map((t) => Date.parse(t))
    .filter((n) => Number.isFinite(n));
  if (parsed.length < 2) return null;
  const spanMs = Math.abs((parsed[0] as number) - (parsed[parsed.length - 1] as number));
  return spanMs / (parsed.length - 1) / 1000;
}

/** "42m" / "2h 10m" / "35s" — compact ETA for the status strip. */
export function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
