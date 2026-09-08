'use client';

import Link from 'next/link';
import { Coins } from 'lucide-react';
import { PaginatedTable, type Column } from '@/components/list/PaginatedTable';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useCoreSlotRewards, type CoreSlotRewardsResponse } from '@/lib/api/queries';
import { formatAmount } from '@/lib/format/amount';
import { formatHeight } from '@/lib/format/height';
import { RewardCaveat } from '@/components/rewards/RewardCaveat';

type Reward = CoreSlotRewardsResponse['data'][number];

// Small CAVEATED rewards subsection (allowed in Phase 11). Full rewards economics is Phase 12.
// The caveat text is sourced from the contract fields on the rows — never implied or invented.
export function CoreSlotRewardsSection({ slotId }: { slotId: string }) {
  const query = useCoreSlotRewards(slotId);
  const firstRow = query.data?.pages[0]?.data[0];

  const columns: Column<Reward>[] = [
    { header: 'Epoch', mono: true, cell: (r) => r.epochNumber },
    {
      header: 'Entitlement',
      mono: true,
      cell: (r) => {
        const a = formatAmount(r.entitlementAmount, r.denom);
        return `${a.display} ${a.symbol}`;
      },
    },
    {
      header: 'Released',
      mono: true,
      cell: (r) => {
        const a = formatAmount(r.releasedAmount, r.denom);
        return `${a.display} ${a.symbol}`;
      },
    },
    {
      header: 'Status at epoch close',
      cell: (r) =>
        r.slotStatusAtEpochClose ? (
          <Badge tone="neutral">{r.slotStatusAtEpochClose.replace(/^SLOT_STATUS_/, '')}</Badge>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    { header: 'Sampled at', mono: true, cell: (r) => formatHeight(r.sampledAtHeight) },
  ];

  return (
    <Card>
      <CardHeader
        icon={Coins}
        iconTone="rewards"
        title="Entitlements (observed projection)"
        action={
          <Link
            href={`/economy?tab=entitlements&slotId=${encodeURIComponent(slotId)}`}
            className="text-primary hover:text-primary-light"
          >
            View all entitlements →
          </Link>
        }
      />
      <CardBody>
        {firstRow ? (
          <RewardCaveat>
            Observed sample (<span className="font-mono">{firstRow.claimSemantics}</span>) — an
            entitlement is created when the epoch closes, and{' '}
            <span className="font-medium">released</span> tracks what x/mining settlement has paid
            out so far. Sampled at height{' '}
            <span className="font-mono">{formatHeight(firstRow.sampledAtHeight)}</span>.
          </RewardCaveat>
        ) : null}
        <PaginatedTable
          query={query}
          columns={columns}
          rowKey={(r) => r.epochNumber}
          context="Rewards"
          emptyMessage="No rewards recorded for this slot."
        />
      </CardBody>
    </Card>
  );
}
