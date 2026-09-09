'use client';

import { useState } from 'react';
import { Scale } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { FilterBar, type FilterValues } from '@/components/list/FilterBar';
import { PaginatedTable, type Column } from '@/components/list/PaginatedTable';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { formatHeight } from '@/lib/format/height';
import { useRewardsBalances, type RewardsBalancesResponse } from '@/lib/api/queries';
import { RewardAmount } from '../RewardAmount';
import { RewardCaveat } from '../RewardCaveat';

type Balance = RewardsBalancesResponse['data'][number];

export function BalancesSection() {
  // Hub section (the page reads no searchParams) — filters live in local state (13b deferral).
  const [filter, setFilter] = useState<FilterValues>({});
  const query = useRewardsBalances(filter);
  const firstRow = query.data?.pages[0]?.data[0];

  const columns: Column<Balance>[] = [
    { header: 'Kind', cell: (b) => b.sampleKind },
    {
      header: 'Module',
      cell: (b) => b.moduleName ?? <span className="text-text-muted">—</span>,
    },
    { header: 'Address', cell: (b) => <MonoCopy value={b.address} label="address" /> },
    { header: 'Amount', cell: (b) => <RewardAmount raw={b.amount} denom={b.denom} /> },
    { header: 'Sampled at', mono: true, cell: (b) => formatHeight(b.height) },
  ];

  return (
    <Card>
      <CardHeader icon={Scale} iconTone="rewards" title="Module / reward balances (sampled)" />
      <CardBody>
        <div className="mb-3">
          <FilterBar
            fields={[
              { param: 'sampleKind', label: 'Kind', placeholder: 'e.g. module_balance' },
              { param: 'denom', label: 'Denom', placeholder: 'utwlt' },
              { param: 'height', label: 'Sampled height', kind: 'digits' },
            ]}
            values={filter}
            onApply={setFilter}
          />
        </div>
        {firstRow ? (
          <RewardCaveat>
            source: <span className="font-mono">{firstRow.source}</span> — observed samples at the
            listed heights, not live balances (total supply excluded by default).
          </RewardCaveat>
        ) : null}
        <PaginatedTable
          query={query}
          columns={columns}
          rowKey={(b) => b.id}
          context="Balances"
          emptyMessage="No balance samples recorded."
        />
      </CardBody>
    </Card>
  );
}
