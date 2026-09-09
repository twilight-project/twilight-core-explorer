'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { NewItemsBar } from '@/components/list/NewItemsBar';
import { PaginatedTable, type Column } from '@/components/list/PaginatedTable';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/ui/CopyButton';
import { StatusFilter } from '@/components/list/StatusFilter';
import { TX_STATUS_OPTIONS, TX_TYPE_GROUP_OPTIONS } from '@/lib/status-filters';
import { useTxsList, type TxsResponse } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { statusTone } from '@/lib/format/status';
import { shortenMiddle } from '@/lib/format/address';

type Tx = TxsResponse['data'][number];

export function TxsList({
  status,
  typeGroup,
}: {
  status?: string | undefined;
  typeGroup?: string | undefined;
}) {
  const query = useTxsList(status, typeGroup);
  const queryClient = useQueryClient();
  const newestLoadedHeight = query.data?.pages[0]?.data[0]?.height ?? null;
  const columns: Column<Tx>[] = [
    {
      header: 'Hash',
      cell: (t) => (
        <span className="inline-flex items-center gap-1.5">
          <Link
            href={`/txs/${encodeURIComponent(t.hash)}`}
            className="font-mono text-primary hover:text-primary-light"
          >
            {shortenMiddle(t.hash)}
          </Link>
          <CopyButton value={t.hash} label="tx hash" />
        </span>
      ),
    },
    {
      header: 'Height',
      mono: true,
      cell: (t) => (
        <Link href={`/blocks/${encodeURIComponent(t.height)}`} className="text-primary hover:text-primary-light">
          {formatHeight(t.height)}
        </Link>
      ),
    },
    { header: 'Index', mono: true, cell: (t) => t.index },
    { header: 'Type', cell: (t) => t.messageTypes[0] ?? '—' },
    { header: 'Status', cell: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <StatusFilter
          label="Status"
          paramName="status"
          value={status ?? ''}
          options={TX_STATUS_OPTIONS}
          preserve={{ type: typeGroup }}
        />
        <StatusFilter
          label="Type"
          paramName="type"
          value={typeGroup ?? ''}
          options={TX_TYPE_GROUP_OPTIONS}
          preserve={{ status }}
        />
      </div>
      <NewItemsBar
        newestLoadedHeight={newestLoadedHeight}
        // The delta counts BLOCKS since the newest loaded tx's block — an activity signal, not a
        // tx count, so the label stays generic.
        label={() => 'New activity indexed — refresh'}
        onRefresh={() => void queryClient.resetQueries({ queryKey: ['txs', 'list'] })}
      />
      <PaginatedTable
        query={query}
        columns={columns}
        rowKey={(t) => t.hash}
        context="Transactions"
        emptyMessage={
          status
            ? `No ${status === 'success' ? 'successful' : status} transactions.`
            : 'No transactions indexed yet.'
        }
      />
    </div>
  );
}
