'use client';

import Link from 'next/link';
import { HandCoins } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { FilterBar } from '@/components/list/FilterBar';
import { PaginatedTable, type Column } from '@/components/list/PaginatedTable';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { formatHeight } from '@/lib/format/height';
import {
  useRewardsEntitlements,
  type EntitlementsFilter,
  type RewardsEntitlementsResponse,
} from '@/lib/api/queries';
import { RewardAmount } from '../RewardAmount';
import { RewardCaveat } from '../RewardCaveat';

type Entitlement = RewardsEntitlementsResponse['data'][number];

/**
 * Replaces the retired claims surface. The chain deleted manual claiming (twilight-core
 * aa568f61), so the reward unit is now a per-(slot, epoch) entitlement: the amount a slot
 * earned when the epoch closed, and how much of it x/mining settlement has released so far.
 *
 * `filter` powers cross-links (?slotId=, ?epoch=, ?payoutAddress=) and — with `showFilters` —
 * the URL-synced filter bar over the server-side EntitlementsQuery params.
 */
export function EntitlementsSection({
  filter,
  showFilters = false,
}: {
  filter?: EntitlementsFilter;
  showFilters?: boolean;
}) {
  const query = useRewardsEntitlements(filter ?? {});
  const firstRow = query.data?.pages[0]?.data[0];

  const columns: Column<Entitlement>[] = [
    {
      header: 'Slot',
      mono: true,
      cell: (e) => (
        <Link
          href={`/coreslots/${encodeURIComponent(e.slotId)}`}
          className="text-primary hover:text-primary-light"
        >
          {e.slotId}
        </Link>
      ),
    },
    // Epoch ordinals render verbatim (no thousands grouping) — consistent with EpochsSection /
    // RewardEpochDetail; formatHeight is for block heights, not epoch numbers. The epoch links
    // to its context line (why the epoch paid what it paid).
    {
      header: 'Epoch',
      mono: true,
      cell: (e) => (
        <Link
          href={`/rewards/epochs/${encodeURIComponent(e.epochNumber)}`}
          className="text-primary hover:text-primary-light"
        >
          {e.epochNumber}
        </Link>
      ),
    },
    {
      header: 'Entitlement',
      cell: (e) => <RewardAmount raw={e.entitlementAmount} denom={e.denom} />,
    },
    { header: 'Released', cell: (e) => <RewardAmount raw={e.releasedAmount} denom={e.denom} /> },
    { header: 'Payout', cell: (e) => <MonoCopy value={e.payoutAddress} label="payout address" /> },
    {
      header: 'Settlement',
      cell: (e) => (
        <Link
          href={`/mining/settlements/${encodeURIComponent(e.slotId)}/${encodeURIComponent(e.epochNumber)}`}
          className="text-sm text-primary hover:text-primary-light"
        >
          view →
        </Link>
      ),
    },
    { header: 'Sampled at', mono: true, cell: (e) => formatHeight(e.sampledAtHeight) },
  ];

  return (
    <Card>
      <CardHeader icon={HandCoins} iconTone="rewards" title="Entitlements" />
      <CardBody>
        {showFilters ? (
          <div className="mb-3">
            <FilterBar
              fields={[
                { param: 'epoch', label: 'Epoch', kind: 'digits', placeholder: 'e.g. 233' },
                { param: 'slotId', label: 'Slot id', kind: 'digits', placeholder: 'e.g. 3' },
                { param: 'payoutAddress', label: 'Payout address', placeholder: 'twilight1…' },
              ]}
              values={{
                epoch: filter?.epoch,
                slotId: filter?.slotId,
                payoutAddress: filter?.payoutAddress,
              }}
            />
          </div>
        ) : null}
        {firstRow ? (
          <RewardCaveat>
            Observed sample (<span className="font-mono">{firstRow.claimSemantics}</span>) — an
            entitlement is created when the epoch closes; released tracks what x/mining settlement
            has paid out. The explorer performs no claim or settlement action.
          </RewardCaveat>
        ) : null}
        <PaginatedTable
          query={query}
          columns={columns}
          rowKey={(e) => e.id}
          context="Entitlements"
          emptyMessage="No entitlements recorded."
        />
      </CardBody>
    </Card>
  );
}
