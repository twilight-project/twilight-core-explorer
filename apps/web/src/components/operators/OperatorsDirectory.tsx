'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { SourceChip } from '@/components/provenance/SourceChip';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/States';
import { useOperators } from '@/lib/api/queries';
import { formatAmount } from '@/lib/format/amount';
import { shortenMiddle } from '@/lib/format/address';

// The /operators directory (phase 14c + 15 §4): one row per slot — name, status, the four
// verdict figures (chain), publishes-status + last-fetch age (feed health). A slot with no
// feed reads as silence ('no status'), never as a blank.

const GRID = 'grid-cols-[56px_1fr_110px_90px_1fr] md:grid-cols-[56px_1fr_120px_110px_90px_150px]';

export function OperatorsDirectory() {
  const operators = useOperators();

  if (operators.isPending) return <LoadingState rows={5} />;
  if (operators.isError) return <ErrorState error={operators.error} context="Operators" />;
  const rows = operators.data.data;
  if (rows.length === 0) return <EmptyState message="No CoreSlots in the registry." />;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px] border-t border-card-border">
        <div
          className={clsx(
            'grid items-center gap-3 border-b border-card-border py-2 font-mono text-[11px] uppercase tracking-[.08em] text-text-muted',
            GRID,
          )}
        >
          <span>slot</span>
          <span>operator</span>
          <span>settled</span>
          <span className="hidden md:block">paid · 30d</span>
          <span>latency</span>
          <span>status feed</span>
        </div>
        {rows.map((r) => {
          const paid = r.verdict ? formatAmount(r.verdict.paid30, r.verdict.denom) : null;
          return (
            <Link
              key={r.slotId}
              href={`/operators/${encodeURIComponent(r.slotId)}`}
              className={clsx(
                'grid items-baseline gap-3 border-b border-card-hover py-[11px] text-[13.5px] text-text hover:text-primary',
                GRID,
              )}
            >
              <span className="font-mono">{r.slotId}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">
                  {r.moniker ??
                    (r.operatorAddress ? shortenMiddle(r.operatorAddress, 12, 6) : '—')}
                </span>
                {r.status && r.status !== 'ACTIVE' ? (
                  <span className="font-mono text-[11px] text-text-muted">{r.status}</span>
                ) : null}
              </span>
              <span className="font-mono">
                {r.verdict ? `${r.verdict.settledAll}/${r.verdict.owedAll}` : '—'}
              </span>
              <span className="hidden font-mono md:block">
                {paid ? `${paid.display}` : '—'}
              </span>
              <span className="font-mono text-text-muted">
                {r.verdict?.medianLatencyBlocks !== null && r.verdict !== null
                  ? `~${r.verdict.medianLatencyBlocks} blk`
                  : '—'}
              </span>
              <span className="flex items-center gap-2">
                {r.feed.publishesStatus ? (
                  <>
                    <span className="text-primary">publishes</span>
                    {r.feed.ageSeconds !== null ? (
                      <span className="font-mono text-[11px] text-text-muted">
                        {r.feed.ageSeconds}s ago
                      </span>
                    ) : null}
                  </>
                ) : (
                  <SourceChip kind="no-status" />
                )}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="pt-2.5 text-xs text-text-muted">
        Settled/paid/latency are chain facts; the status column is the explorer&apos;s own
        observation of each operator&apos;s feed. There is no trust score — the figures are the
        whole of the explorer&apos;s opinion.
      </p>
    </div>
  );
}
