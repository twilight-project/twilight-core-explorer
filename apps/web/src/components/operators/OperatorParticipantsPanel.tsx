'use client';

import Link from 'next/link';
import { SourceChip } from '@/components/provenance/SourceChip';
import { CopyButton } from '@/components/ui/CopyButton';
import { Panel, MetricTriple } from './Panel';
import { useOperatorParticipants } from '@/lib/api/queries';
import { formatAmount } from '@/lib/format/amount';
import { shortenMiddle } from '@/lib/format/address';

// Participants: how many people mine with this slot. Two provenances, kept apart on purpose:
//  - enrolled-this-epoch is the operator's own live count (attested) — pseudonymous by
//    contract (ADR-MINIS-0020), so no addresses exist for it.
//  - paid participants are chain facts: every address a settlement has ever paid, with totals.
export function OperatorParticipantsPanel({
  slotId,
  showAddresses = false,
}: {
  slotId: string;
  /** Data tab: also list every paid address. The overview shows the counts only. */
  showAddresses?: boolean;
}) {
  const q = useOperatorParticipants(slotId);
  if (q.isPending || q.isError) return null;
  const d = q.data.data;

  return (
    <Panel
      title="Participants"
      meta={
        <>
          <span className="text-primary">chain</span> ·{' '}
          <span className="text-accent-orange">attested</span>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <MetricTriple
          label="Enrolled this epoch"
          value={d.enrolled ? String(d.enrolled.enrolled) : '—'}
          tone={d.enrolled && d.enrolled.enrolled > 0 ? 'mint' : 'text'}
          note={
            d.enrolled
              ? `Epoch ${d.enrolled.epochNumber}, operator's own count${d.enrolled.ageSeconds !== null ? `, ${d.enrolled.ageSeconds}s old` : ''}. Pseudonymous by contract — no addresses exist for enrollment.`
              : 'No feed sample yet.'
          }
        />
        <MetricTriple
          label="Participants paid, all time"
          value={String(d.paidAll)}
          note="Distinct addresses that received a settlement payout from this slot. Chain facts."
        />
        <MetricTriple
          label="Paid in the last 30 days"
          value={String(d.paid30)}
          note="Distinct addresses with a payout in the window."
        />
      </div>

      {showAddresses ? (
        d.participants.length === 0 ? (
          <p className="pt-4 text-[13px] text-text-muted">No payouts yet — no addresses to show.</p>
        ) : (
          <div className="pt-4">
            <div className="grid grid-cols-[minmax(0,1fr)_72px_110px_72px] gap-3 border-b border-card-border pb-2 font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
              <span>address (paid by the chain)</span>
              <span className="text-right">epochs</span>
              <span className="text-right">received</span>
              <span className="text-right">last</span>
            </div>
            {d.participants.map((r) => {
              const total = formatAmount(r.totalReceived, d.denom);
              return (
                <div
                  key={r.recipient}
                  className="grid grid-cols-[minmax(0,1fr)_72px_110px_72px] items-baseline gap-3 border-b border-card-hover py-2 font-mono text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Link
                      href={`/accounts/${encodeURIComponent(r.recipient)}`}
                      className="truncate text-text hover:text-primary"
                      title={r.recipient}
                    >
                      {shortenMiddle(r.recipient)}
                    </Link>
                    <CopyButton value={r.recipient} label="address" />
                  </span>
                  <span className="text-right text-text-secondary">{r.epochsPaid}</span>
                  <span className="text-right text-text-secondary">
                    {total.display} <span className="text-text-muted">{total.symbol}</span>
                  </span>
                  <span className="text-right text-text-muted">ep {r.lastEpoch}</span>
                </div>
              );
            })}
            <p className="pt-3 font-mono text-[11px] leading-relaxed text-text-muted">
              Addresses come from settlement payouts on chain <SourceChip kind="chain" /> —
              enrolled-but-unpaid participants stay pseudonymous by the feed contract.
            </p>
          </div>
        )
      ) : null}
    </Panel>
  );
}
