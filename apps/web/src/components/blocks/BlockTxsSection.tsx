'use client';

import Link from 'next/link';
import { PaginatedTable, type Column } from '@/components/list/PaginatedTable';
import { Badge } from '@/components/ui/Badge';
import { useTxsByHeight, type TxsResponse } from '@/lib/api/queries';
import { statusTone } from '@/lib/format/status';
import { formatAmount } from '@/lib/format/amount';
import { summarizeMessageTypes } from '@/lib/format/summary';

type Tx = TxsResponse['data'][number];

// Transactions in a block, via the /txs `height` filter (block -> txs). Control-room columns:
// summary string · hash · fee (CR-D list-fee field) · status.
export function BlockTxsSection({ height }: { height: string }) {
  const query = useTxsByHeight(height);
  const columns: Column<Tx>[] = [
    { header: 'Summary', cell: (t) => summarizeMessageTypes(t.messageTypes) },
    {
      header: 'Hash',
      cell: (t) => (
        <Link href={`/txs/${encodeURIComponent(t.hash)}`} className="text-primary hover:text-primary-light">
          <span className="font-mono">{t.hash.slice(0, 12)}…</span>
        </Link>
      ),
    },
    {
      header: 'Fee',
      mono: true,
      cell: (t) => {
        if (!t.feeAmount || !t.feeDenom) return '—';
        const a = formatAmount(t.feeAmount, t.feeDenom);
        return `${a.display} ${a.symbol}`;
      },
    },
    { header: 'Status', cell: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
  ];
  return (
    <PaginatedTable
      query={query}
      columns={columns}
      rowKey={(t) => t.hash}
      context="Block transactions"
      emptyMessage="No transactions in this block."
    />
  );
}
