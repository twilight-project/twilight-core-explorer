'use client';

import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PaginatedTable, type Column } from '@/components/list/PaginatedTable';
import { formatHeight } from '@/lib/format/height';
import { formatAmount } from '@/lib/format/amount';
import { useSettlementStatus } from '@/lib/api/queries';
import {
  SETTLEMENT_STATE_TONE,
  deriveSettlementState,
  type SettlementSlotSummary,
  type SettlementStatusRow,
} from '@/lib/settlement-state';

/**
 * Expected vs settled, per (epoch, slot): every epoch a slot holds an entitlement for, against
 * the finalization that did (or did not) happen. Open and late are STATES, not absences — an
 * entitlement with no finalization is a settlement the chain still owes. "Late" means open
 * longer than the slot's own p90 finalization latency.
 */
export function SettlementsStatusSection({ slotId }: { slotId?: string | undefined } = {}) {
  const query = useSettlementStatus(slotId !== undefined ? { slotId } : undefined);

  const slots = query.data?.pages[0]?.slots ?? [];
  const bySlot = new Map<string, SettlementSlotSummary>(slots.map((s) => [s.slotId, s]));

  const columns: Column<SettlementStatusRow>[] = [
    // Epoch ordinals render verbatim — formatHeight is for block heights.
    {
      header: 'Epoch',
      mono: true,
      cell: (r) => (
        <Link
          href={`/rewards/epochs/${encodeURIComponent(r.epochNumber)}`}
          className="text-primary hover:text-primary-light"
        >
          {r.epochNumber}
        </Link>
      ),
    },
    {
      header: 'Slot',
      mono: true,
      cell: (r) => (
        <Link
          href={`/coreslots/${encodeURIComponent(r.slotId)}`}
          className="text-primary hover:text-primary-light"
        >
          {r.slotId}
        </Link>
      ),
    },
    {
      header: 'State',
      cell: (r) => {
        const state = deriveSettlementState(r, bySlot.get(r.slotId));
        return <Badge tone={SETTLEMENT_STATE_TONE[state]}>{state}</Badge>;
      },
    },
    {
      header: 'Entitlement',
      mono: true,
      cell: (r) => {
        const a = formatAmount(r.entitlementAmount, r.denom);
        return `${a.display} ${a.symbol}`;
      },
    },
    {
      header: 'Settled at',
      mono: true,
      cell: (r) =>
        r.settled && r.finalizedHeight ? (
          <Link
            href={`/mining/settlements/${encodeURIComponent(r.slotId)}/${encodeURIComponent(r.epochNumber)}`}
            className="text-primary hover:text-primary-light"
          >
            {formatHeight(r.finalizedHeight)}
          </Link>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      header: 'Latency',
      mono: true,
      cell: (r) => {
        if (r.latencyBlocks !== null) return `+${r.latencyBlocks} blocks`;
        if (r.openForBlocks !== null)
          return <span className="text-text-muted">open {r.openForBlocks} blocks</span>;
        return <span className="text-text-muted">unknown</span>;
      },
    },
  ];

  return (
    <Card>
      <CardHeader icon={Landmark} iconTone="rewards" title="Settlements — expected vs settled" />
      <CardBody>
        <p className="mb-3 text-sm text-text-muted">
          Every epoch a slot holds an entitlement for, against the finalization the chain
          observed. Settled is true only on an emitted finalization — never inferred. Late means
          open longer than that slot&apos;s own p90 settlement latency.
        </p>
        {slots.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {slots.map((s) => (
              <span
                key={s.slotId}
                className="rounded-lg border border-card-border bg-background-secondary px-2.5 py-1.5 text-xs text-text-secondary"
              >
                <span className="text-text">Slot {s.slotId}</span>
                {' · '}
                {s.settledCount} settled
                {s.openCount > 0 ? `, ${s.openCount} open` : ''}
                {s.medianLatencyBlocks != null
                  ? ` · usually within ${s.medianLatencyBlocks} blocks of close`
                  : ''}
              </span>
            ))}
          </div>
        ) : null}
        <PaginatedTable
          query={query}
          columns={columns}
          rowKey={(r) => `${r.slotId}:${r.epochNumber}`}
          context="Settlement status"
          emptyMessage="No entitlements recorded yet — settlements appear once an epoch closes with an entitlement."
        />
      </CardBody>
    </Card>
  );
}
