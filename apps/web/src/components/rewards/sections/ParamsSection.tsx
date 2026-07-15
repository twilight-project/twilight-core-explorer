'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { FilterBar, type FilterValues } from '@/components/list/FilterBar';
import { PaginatedTable, type Column } from '@/components/list/PaginatedTable';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { JsonView } from '@/components/detail/JsonView';
import { formatHeight } from '@/lib/format/height';
import { useRewardsParams, type RewardsParamsResponse } from '@/lib/api/queries';

type ParamsChange = RewardsParamsResponse['data'][number];

export function ParamsSection() {
  // Hub section — local-state filter (13b deferral); the API filters server-side.
  const [filter, setFilter] = useState<FilterValues>({});
  const query = useRewardsParams(filter['changeType']);

  const columns: Column<ParamsChange>[] = [
    { header: 'Change', cell: (p) => p.changeType },
    { header: 'Authority', cell: (p) => <MonoCopy value={p.authority} label="authority" /> },
    { header: 'Height', mono: true, cell: (p) => formatHeight(p.height) },
    { header: 'Tx', cell: (p) => <MonoCopy value={p.txHash} label="tx hash" /> },
    { header: 'Params', cell: (p) => <JsonView value={p.params} /> },
  ];

  return (
    <Card>
      <CardHeader icon={SlidersHorizontal} iconTone="rewards" title="Params changes" />
      <CardBody>
        <div className="mb-3">
          <FilterBar
            fields={[
              { param: 'changeType', label: 'Change type', placeholder: 'e.g. params_update' },
            ]}
            values={filter}
            onApply={setFilter}
          />
        </div>
        <PaginatedTable
          query={query}
          columns={columns}
          rowKey={(p) => p.id}
          context="Params changes"
          emptyMessage="No rewards params changes recorded."
        />
      </CardBody>
    </Card>
  );
}
