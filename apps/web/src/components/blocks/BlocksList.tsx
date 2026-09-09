'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { NewItemsBar } from '@/components/list/NewItemsBar';
import { PaginatedTable, type Column } from '@/components/list/PaginatedTable';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { OperatorLink } from '@/components/operator/OperatorLink';
import { useBlocksList, type BlocksResponse } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { formatRelativeTime } from '@/lib/format/time';

type Block = BlocksResponse['data'][number];

export function BlocksList() {
  const query = useBlocksList();
  const queryClient = useQueryClient();
  const newestLoadedHeight = query.data?.pages[0]?.data[0]?.height ?? null;
  const columns: Column<Block>[] = [
    {
      header: 'Height',
      mono: true,
      cell: (b) => (
        <Link href={`/blocks/${encodeURIComponent(b.height)}`} className="text-primary hover:text-primary-light">
          {formatHeight(b.height)}
        </Link>
      ),
    },
    { header: 'Age', cell: (b) => formatRelativeTime(b.time) },
    { header: 'Txs', mono: true, cell: (b) => b.txCount },
    {
      header: 'Proposer',
      cell: (b) =>
        b.proposer.operatorAddress ? (
          <OperatorLink operatorAddress={b.proposer.operatorAddress} />
        ) : (
          <MonoCopy value={b.proposer.address ?? b.proposer.rawAddress} label="proposer" />
        ),
    },
  ];
  return (
    <div className="space-y-3">
      <NewItemsBar
        newestLoadedHeight={newestLoadedHeight}
        label={(delta) => `${formatHeight(delta)} new block${delta === '1' ? '' : 's'} — refresh`}
        // Keyset list: restart from page one at the new head (never refetch every loaded page).
        onRefresh={() => void queryClient.resetQueries({ queryKey: ['blocks', 'list'] })}
      />
      <PaginatedTable
        query={query}
        columns={columns}
        rowKey={(b) => b.height}
        context="Blocks"
        emptyMessage="No blocks indexed yet."
      />
    </div>
  );
}
