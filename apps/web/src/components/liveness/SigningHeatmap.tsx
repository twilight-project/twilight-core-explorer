'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { Activity } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { QueryBoundary } from '@/components/QueryBoundary';
import { EmptyState } from '@/components/states/States';
import { useSigningHeatmap } from '@/lib/api/queries';
import { shortenMiddle } from '@/lib/format/address';
import { formatHeight } from '@/lib/format/height';

// The real per-CoreSlot signing heatmap (replaces the PreviewHeatmap): each row is a CoreSlot, each
// cell a committed block — green signed, red missed, neutral where the slot had no evidence at that
// height. Data from GET /network/signing-heatmap (the +2-correct CoreSlotLivenessEvidence projection).
function cellClass(status: 'signed' | 'missed' | null): string {
  if (status === 'signed') return 'bg-accent-green';
  if (status === 'missed') return 'bg-accent-red';
  return 'bg-background-tertiary'; // no evidence for this slot at this height
}

export function SigningHeatmap() {
  const query = useSigningHeatmap();
  return (
    <Card>
      <CardHeader
        icon={Activity}
        iconTone="liveness"
        title="Signing window heatmap"
        action={
          <span className="font-mono text-xs text-text-muted">
            signed/missed per block · misses per slot →
          </span>
        }
      />
      <CardBody>
        <QueryBoundary query={query} context="Signing heatmap" loadingRows={4}>
          {(res) => {
            const d = res.data;
            if (d.slots.length === 0) {
              return <EmptyState message="No per-block signing evidence yet." />;
            }
            return (
              <div className="space-y-3">
                <p className="text-xs text-text-muted">
                  Per-CoreSlot signed / missed over the last {d.blocksInWindow} committed blocks
                  {d.fromHeight && d.toHeight
                    ? ` (${formatHeight(d.fromHeight)}–${formatHeight(d.toHeight)})`
                    : ''}
                  .
                </p>
                <div className="space-y-2">
                  {d.slots.map((s) => {
                    const expected = s.signed + s.missed;
                    return (
                      <div key={s.slotId} className="flex items-center gap-3">
                        <Link
                          href={`/coreslots/${encodeURIComponent(s.slotId)}`}
                          className="w-28 shrink-0 truncate font-mono text-xs text-primary hover:text-primary-light"
                          title={s.operatorAddress ?? `slot ${s.slotId}`}
                        >
                          {s.operatorAddress ? shortenMiddle(s.operatorAddress) : `slot ${s.slotId}`}
                        </Link>
                        {/* The cell strip is one labelled image for assistive tech: per-cell title
                            tooltips aren't reliably announced, so the row's signed/missed summary
                            carries the meaning while the individual cells are decorative. */}
                        <div
                          className="flex flex-1 flex-wrap gap-[3px]"
                          role="img"
                          aria-label={`${s.operatorAddress ?? `slot ${s.slotId}`}: ${s.signed} signed, ${s.missed} missed (of ${expected} blocks with evidence)`}
                        >
                          {s.cells.map((c, i) => (
                            <span
                              key={i}
                              aria-hidden="true"
                              className={clsx('h-3.5 w-2.5 rounded-sm', cellClass(c))}
                              title={`${d.heights[i] ?? ''}: ${c ?? 'no evidence'}`}
                            />
                          ))}
                        </div>
                        <span
                          className={clsx(
                            'w-16 shrink-0 text-right font-mono text-xs',
                            s.missed > 0 ? 'text-accent-red' : 'text-text-muted',
                          )}
                        >
                          {s.missed} / {expected}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-accent-green" />
                    Signed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-accent-red" />
                    Missed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-background-tertiary" />
                    No evidence
                  </span>
                </div>
              </div>
            );
          }}
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}
