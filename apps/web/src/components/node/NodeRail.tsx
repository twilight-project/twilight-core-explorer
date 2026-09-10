'use client';

import {
  useCoreSlots,
  useLatestBlocks,
  useRewardsEpochs,
  useStatus,
} from '@/lib/api/queries';
import { averageBlockSeconds, deriveEpochEta, formatEta } from '@/lib/epoch-eta';
import { formatAmount } from '@/lib/format/amount';
import { formatHeight } from '@/lib/format/height';
import type { SettlementSlotSummary, SettlementStatusRow } from '@/lib/settlement-state';

// Right-rail cards for the My-node view. NEXT PAYOUT is the one labelled ESTIMATE on the
// page: last epoch's totalReward × this slot's weight share, closing on the epoch-spacing
// clock estimate. UNSETTLED replaces the prototype's UNCLAIMED card — this chain has no claim
// step, so what an operator is owed is the sum of OPEN settlements; hidden when zero, and no
// CLI line (settlement is driven by the slot's settlement address, not a user claim).

export function NextPayoutCard({
  slotId,
  rewardWeight,
}: {
  slotId: string;
  rewardWeight: string | null;
}) {
  const epochs = useRewardsEpochs();
  const status = useStatus();
  const blocks = useLatestBlocks(8);
  const slots = useCoreSlots();

  const latest = epochs.data?.pages[0]?.data[0];
  const eta = deriveEpochEta({
    epochs: epochs.data?.pages[0]?.data ?? [],
    headHeight: status.data?.data.indexer?.latestChainHeight,
    avgBlockSeconds: averageBlockSeconds(blocks.data?.data.map((b) => b.time) ?? []),
  });

  // Weight share over the ACTIVE registry (float display only — the amounts stay BigInt-free
  // here because this whole card is an estimate).
  const active = (slots.data?.data ?? []).filter((s) => s.status === 'ACTIVE');
  const totalWeight = active.reduce((acc, s) => acc + (Number(s.rewardWeight) || 0), 0);
  const ownWeight = Number(rewardWeight) || 0;
  const share = totalWeight > 0 ? ownWeight / totalWeight : null;

  let estimate: string | null = null;
  if (latest?.totalReward && share !== null) {
    const a = formatAmount(latest.totalReward, latest.denom ?? 'utwlt');
    const value = Number(a.display.replace(/,/g, '')) * share;
    if (Number.isFinite(value)) estimate = value.toFixed(1);
  }

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-card-border bg-card px-5 py-[18px]">
      <div className="font-mono text-xs text-text-muted">NEXT PAYOUT (EST.)</div>
      <div className="font-mono text-[28px] text-primary">
        {estimate !== null ? `~${estimate}` : '…'}{' '}
        <span className="text-sm text-text-muted">TWLT</span>
      </div>
      <div className="text-[13px] leading-relaxed text-text-muted">
        {eta ? (
          <>
            Epoch {eta.epochNumber} closes{' '}
            {eta.etaSeconds !== null ? `in ~${formatEta(eta.etaSeconds)}` : `in ${eta.remainingBlocks} blocks`}{' '}
            at block {formatHeight(eta.closesAtHeight)} (est.).
          </>
        ) : (
          'Epoch clock unavailable.'
        )}{' '}
        {share !== null ? `Weight ${ownWeight} of ${totalWeight}.` : ''}
      </div>
      <div className="h-1 overflow-hidden rounded-sm bg-background-tertiary">
        <span
          className="block h-full bg-primary"
          style={{ width: `${Math.round((eta?.progress ?? 0) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function UnsettledCard({
  rows,
  summary,
}: {
  rows: SettlementStatusRow[];
  summary: SettlementSlotSummary | undefined;
}) {
  const open = rows.filter((r) => !r.settled);
  if (open.length === 0) return null;
  const total = open.reduce((acc, r) => acc + BigInt(r.entitlementAmount), 0n);
  const a = formatAmount(total.toString(), open[0]?.denom ?? 'utwlt');
  const epochCount = summary?.openCount ?? open.length;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-card-border px-5 py-[18px]">
      <div className="font-mono text-xs text-text-muted">UNSETTLED</div>
      <div className="font-mono text-[22px] text-text">
        {a.display}{' '}
        <span className="text-[13px] text-text-muted">
          {a.symbol} · {epochCount} epoch{epochCount === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-text-muted">
        Open settlements — x/mining pays them out directly when the settlement window runs;
        there is no claim step on this chain.
      </p>
    </div>
  );
}
