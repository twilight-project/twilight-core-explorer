'use client';

import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PaginatedTable, type Column } from '@/components/list/PaginatedTable';
import { formatHeight } from '@/lib/format/height';
import { formatAmount } from '@/lib/format/amount';
import { useSlotSettlements, type SettlementsResponse } from '@/lib/api/queries';

type Settlement = SettlementsResponse['data'][number];

/** `SETTLEMENT_FINALIZATION_REASON_AUTHORIZED_EARLY` -> `authorized early`. */
function reasonLabel(reason: string | null): string {
  if (!reason) return '—';
  return reason.replace(/^SETTLEMENT_FINALIZATION_REASON_/, '').toLowerCase().replace(/_/g, ' ');
}

/**
 * Settlements for a CoreSlot: whether each epoch's entitlement was settled, and how much
 * reached participants.
 *
 * This is an ACTIVITY view. The chain creates a settlement per entitlement silently — x/mining's
 * EndBlocker emits no events at all — so a settlement that was created and never touched leaves
 * no trace to index. Absence here means "nothing observed", not "does not exist", and the copy
 * says so rather than implying full coverage.
 */
export function CoreSlotSettlementsSection({ slotId }: { slotId: string }) {
  const query = useSlotSettlements(slotId);

  const columns: Column<Settlement>[] = [
    // Epoch ordinals render verbatim — formatHeight is for block heights.
    {
      header: 'Epoch',
      mono: true,
      cell: (s) => (
        <Link
          href={`/mining/settlements/${encodeURIComponent(s.slotId)}/${encodeURIComponent(s.epochNumber)}`}
          className="text-primary hover:text-primary-light"
        >
          {s.epochNumber}
        </Link>
      ),
    },
    {
      header: 'Status',
      cell: (s) =>
        s.settled ? (
          <Badge tone="success">settled</Badge>
        ) : (
          <Badge tone="warning">open</Badge>
        ),
    },
    { header: 'How', cell: (s) => reasonLabel(s.finalizationReason) },
    {
      header: 'Paid to participants',
      mono: true,
      cell: (s) => {
        const a = formatAmount(s.totalPaid, s.denom);
        return `${a.display} ${a.symbol}`;
      },
    },
    { header: 'Recipients', mono: true, cell: (s) => String(s.payoutCount) },
    {
      header: 'Remainder to operator',
      mono: true,
      cell: (s) => {
        if (s.releasedRemainder === null) return <span className="text-text-muted">—</span>;
        const a = formatAmount(s.releasedRemainder, s.denom);
        return `${a.display} ${a.symbol}`;
      },
    },
    { header: 'Height', mono: true, cell: (s) => formatHeight(s.lastHeight) },
  ];

  return (
    <Card>
      <CardHeader icon={Landmark} iconTone="rewards" title="Settlements" />
      <CardBody>
        <p className="mb-3 text-sm text-text-muted">
          How this slot&apos;s epoch entitlements were paid out. Only settlements with observed
          activity appear — the chain creates them silently, so one that was never touched leaves
          nothing to index.
        </p>
        <PaginatedTable
          query={query}
          columns={columns}
          rowKey={(s) => `${s.slotId}:${s.epochNumber}`}
          context="Settlements"
          emptyMessage="No settlement activity recorded for this CoreSlot."
        />
      </CardBody>
    </Card>
  );
}
