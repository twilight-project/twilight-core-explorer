'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { Panel } from './Panel';
import { SourceChip } from '@/components/provenance/SourceChip';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/States';
import {
  useFeedEpochFanout,
  useSettlementStatus,
  useSlotSettlements,
} from '@/lib/api/queries';
import { asRecord, feedNumber, feedString } from '@/lib/operator-feed';
import { formatAmount } from '@/lib/format/amount';

// Track record (profile v2 §content-1): one row per epoch OWED, columns epoch · owed · paid ·
// recip. · latency · "operator said". Owed/paid/recipients/latency are chain facts; the
// operator's published share × admitted count is checked per epoch — a strike-through means
// the chain disagreed, and the chain's numbers follow the strike.

const GRID = 'grid-cols-[44px_64px_64px_44px_52px_minmax(0,1fr)]';

export function OperatorTrackRecord({ slotId }: { slotId: string }) {
  const status = useSettlementStatus({ slotId });
  const activity = useSlotSettlements(slotId);

  const owed = status.data?.pages.flatMap((p) => p.data) ?? [];
  const settledEpochs = owed.filter((r) => r.settled).map((r) => r.epochNumber);
  const feed = useFeedEpochFanout(slotId, settledEpochs);

  const meta = (
    <>
      one row per epoch owed · <span className="text-primary">chain</span> vs{' '}
      <span className="text-accent-orange">attested</span>
    </>
  );

  if (status.isPending) {
    return (
      <Panel title="Track record" meta={meta}>
        <LoadingState rows={5} />
      </Panel>
    );
  }
  if (status.isError) {
    return (
      <Panel title="Track record" meta={meta}>
        <ErrorState error={status.error} context="Track record" />
      </Panel>
    );
  }
  if (owed.length === 0) {
    return (
      <Panel title="Track record" meta={meta}>
        <EmptyState message="No epochs owed yet — no entitlements recorded for this slot." />
      </Panel>
    );
  }

  const activityByEpoch = new Map(
    (activity.data?.pages.flatMap((p) => p.data) ?? []).map((s) => [s.epochNumber, s]),
  );
  const feedByEpoch = new Map((feed.data ?? []).map((f) => [f.epoch, f.data]));

  return (
    <Panel title="Track record" meta={meta} bodyClassName="">
      <div
        className={clsx(
          'grid gap-2.5 bg-background-secondary px-5 py-2 font-mono text-[11px] uppercase tracking-[.08em] text-text-muted',
          GRID,
        )}
      >
        <span>epoch</span>
        <span>owed</span>
        <span>paid</span>
        <span>recip.</span>
        <span>latency</span>
        <span>operator said</span>
      </div>
      {owed.slice(0, 8).map((r) => {
        const act = activityByEpoch.get(r.epochNumber);
        const f = feedByEpoch.get(r.epochNumber);
        const feedOk = f && 'payload' in f ? f : null;
        const verification = feedOk?.verification ?? null;
        const share = feedOk ? asRecord(asRecord(feedOk.payload)['share']) : {};
        const shareAmount = feedString(share['amount']);
        const admitted = feedOk
          ? feedNumber(asRecord(asRecord(feedOk.payload)['counts'])['admitted'])
          : null;
        const shareFmt = shareAmount ? formatAmount(shareAmount, r.denom).display : '—';
        const owedFmt = formatAmount(r.entitlementAmount, r.denom).display;
        const paidFmt = act ? formatAmount(act.totalPaid, act.denom).display : null;
        const mismatch = verification?.result === 'mismatch';
        const chainShare =
          verification && verification.chain.payoutAmounts.length > 0
            ? formatAmount(verification.chain.payoutAmounts[0] ?? '0', r.denom).display
            : '0';
        return (
          <div
            key={r.epochNumber}
            className={clsx(
              'grid items-center gap-2.5 border-t border-card-hover px-5 py-2.5 font-mono text-[13px]',
              GRID,
            )}
          >
            <Link
              href={`/mining/settlements/${encodeURIComponent(slotId)}/${encodeURIComponent(r.epochNumber)}`}
              className="text-primary hover:text-primary-light"
            >
              {r.epochNumber}
            </Link>
            <span>{owedFmt}</span>
            <span className={paidFmt ? 'text-text' : 'text-text-muted'}>{paidFmt ?? '—'}</span>
            <span>{act ? act.payoutCount : '—'}</span>
            <span className="text-text-muted">
              {r.latencyBlocks !== null
                ? `+${r.latencyBlocks}`
                : r.openForBlocks !== null
                  ? `open ${r.openForBlocks}`
                  : '—'}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              {verification ? (
                verification.result === 'verified' ? (
                  <>
                    <SourceChip kind="verified" title="The operator's figures match the chain" />
                    <span className="text-[11px] leading-snug text-text-muted">
                      share {shareFmt} · admitted {admitted ?? '—'}
                    </span>
                  </>
                ) : mismatch ? (
                  <>
                    <SourceChip
                      kind="mismatch"
                      title={`failed: ${verification.failedChecks.join(', ')}`}
                    />
                    <span className="text-[11px] leading-snug text-text-muted line-through">
                      share {shareFmt} · admitted {admitted ?? '—'}
                    </span>
                    <span className="text-[11px] leading-snug text-text">
                      → chain: {chainShare} × {verification.chain.recipients}
                    </span>
                  </>
                ) : null
              ) : r.settled && feed.isFetched ? (
                <>
                  <SourceChip kind="no-status" />
                  <span className="text-[11px] text-text-muted">no figures published</span>
                </>
              ) : !r.settled ? (
                <span className="text-[11px] text-text-muted">not settled yet</span>
              ) : null}
            </span>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-card-border px-5 py-3">
        <span className="max-w-xl font-mono text-[11.5px] leading-relaxed text-text-muted">
          Owed, paid, recipients and latency are chain facts. &ldquo;Operator said&rdquo; is its
          published share × admitted count, checked per epoch; a strike-through means the chain
          disagreed.
        </span>
        <Link
          href={`/economy?tab=settlements&slotId=${encodeURIComponent(slotId)}`}
          className="shrink-0 text-[13px] text-primary hover:text-primary-light"
        >
          All {owed.length} epochs →
        </Link>
      </div>
    </Panel>
  );
}
