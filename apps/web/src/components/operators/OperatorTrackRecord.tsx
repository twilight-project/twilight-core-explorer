'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { SourceChip } from '@/components/provenance/SourceChip';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/States';
import {
  useFeedEpochFanout,
  useSettlementStatus,
  useSlotSettlements,
} from '@/lib/api/queries';
import { deriveSettlementState, SETTLEMENT_STATE_TONE } from '@/lib/settlement-state';
import { asRecord, feedNumber, feedString } from '@/lib/operator-feed';
import { formatAmount } from '@/lib/format/amount';

// §5.6 — one row per epoch OWED (entitlement exists), joining three sources by epoch:
// the expectation (settlement-status: state/latency), the chain activity (settlements:
// paid/recipients/remainder/reason), and the operator's feed (share/admitted) with the §6.5
// verified/mismatch mark. The chain wins every disagreement — a mismatching operator figure
// renders struck through beside the chain's number.

const GRID = 'grid-cols-[64px_1fr_90px_60px_1fr] md:grid-cols-[64px_110px_110px_70px_110px_90px_1fr]';

export function OperatorTrackRecord({ slotId }: { slotId: string }) {
  const status = useSettlementStatus({ slotId });
  const activity = useSlotSettlements(slotId);

  const owed = status.data?.pages.flatMap((p) => p.data) ?? [];
  const slotSummary = status.data?.pages[0]?.slots.find((s) => s.slotId === slotId);
  const settledEpochs = owed.filter((r) => r.settled).map((r) => r.epochNumber);
  const feed = useFeedEpochFanout(slotId, settledEpochs);

  if (status.isPending) return <LoadingState rows={5} />;
  if (status.isError) return <ErrorState error={status.error} context="Track record" />;
  if (owed.length === 0) {
    return <EmptyState message="No epochs owed yet — no entitlements recorded for this slot." />;
  }

  const activityByEpoch = new Map(
    (activity.data?.pages.flatMap((p) => p.data) ?? []).map((s) => [s.epochNumber, s]),
  );
  const feedByEpoch = new Map((feed.data ?? []).map((f) => [f.epoch, f.data]));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px] border-t border-card-border">
        <div
          className={clsx(
            'grid items-center gap-3 border-b border-card-border py-2 font-mono text-[11px] uppercase tracking-[.08em] text-text-muted',
            GRID,
          )}
        >
          <span>epoch</span>
          <span>entitlement</span>
          <span className="hidden md:block">paid</span>
          <span className="hidden md:block">recip.</span>
          <span>remainder</span>
          <span>latency</span>
          <span>state · operator&apos;s figures</span>
        </div>
        {owed.slice(0, 20).map((r) => {
          const state = deriveSettlementState(r, slotSummary);
          const act = activityByEpoch.get(r.epochNumber);
          const f = feedByEpoch.get(r.epochNumber);
          const feedOk = f && 'payload' in f ? f : null;
          const verification = feedOk?.verification ?? null;
          const share = feedOk ? asRecord(asRecord(feedOk.payload)['share']) : {};
          const shareAmount = feedString(share['amount']);
          const admitted = feedOk
            ? feedNumber(asRecord(asRecord(feedOk.payload)['counts'])['admitted'])
            : null;
          const ent = formatAmount(r.entitlementAmount, r.denom);
          const paid = act ? formatAmount(act.totalPaid, act.denom) : null;
          const remainder =
            act?.releasedRemainder != null ? formatAmount(act.releasedRemainder, act.denom) : null;
          const mismatch = verification?.result === 'mismatch';
          return (
            <div
              key={r.epochNumber}
              className={clsx('grid items-baseline gap-3 border-b border-card-hover py-2.5 text-[13px]', GRID)}
            >
              <Link
                href={`/mining/settlements/${encodeURIComponent(slotId)}/${encodeURIComponent(r.epochNumber)}`}
                className="font-mono text-primary hover:text-primary-light"
              >
                {r.epochNumber}
              </Link>
              <span className="font-mono">{ent.display}</span>
              <span className="hidden font-mono md:block">{paid ? paid.display : '—'}</span>
              <span className="hidden font-mono md:block">{act ? act.payoutCount : '—'}</span>
              <span className="font-mono">
                {remainder ? remainder.display : state === 'settled' ? '0' : '—'}
              </span>
              <span className="font-mono text-text-muted">
                {r.latencyBlocks !== null
                  ? `+${r.latencyBlocks}`
                  : r.openForBlocks !== null
                    ? `open ${r.openForBlocks}`
                    : '—'}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className={clsx(
                    'font-mono text-xs',
                    SETTLEMENT_STATE_TONE[state] === 'success'
                      ? 'text-primary'
                      : SETTLEMENT_STATE_TONE[state] === 'danger'
                        ? 'text-accent-red'
                        : 'text-text-muted',
                  )}
                >
                  {state}
                </span>
                {verification ? (
                  verification.result === 'verified' ? (
                    <span className="flex items-center gap-1.5 font-mono text-xs text-text-muted">
                      share {shareAmount ?? '—'} · admitted {admitted ?? '—'}
                      <SourceChip kind="verified" title="The operator's figures match the chain" />
                    </span>
                  ) : mismatch ? (
                    <span className="flex items-center gap-1.5 font-mono text-xs">
                      <span className="text-text-muted line-through">
                        share {shareAmount ?? '—'} · admitted {admitted ?? '—'}
                      </span>
                      <span className="text-text">
                        chain: {verification.chain.payoutAmounts.join('/') || '0'} ·{' '}
                        {verification.chain.recipients}
                      </span>
                      <SourceChip
                        kind="mismatch"
                        title={`operator's figures do not match the chain (${verification.failedChecks.join(', ')})`}
                      />
                    </span>
                  ) : null
                ) : r.settled && feed.isFetched ? (
                  <SourceChip kind="no-status" title="No operator status for this epoch" />
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-2.5">
        <p className="text-xs text-text-muted">
          States and figures left of the mark are chain facts; the operator&apos;s stated share
          and admitted count are attested and checked against the chain per epoch.
        </p>
        <Link
          href={`/economy?tab=settlements&slotId=${encodeURIComponent(slotId)}`}
          className="shrink-0 text-[13px] text-primary hover:text-primary-light"
        >
          All settlements →
        </Link>
      </div>
    </div>
  );
}
