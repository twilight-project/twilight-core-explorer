'use client';

import Link from 'next/link';
import { HandCoins } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PaginatedTable, type Column } from '@/components/list/PaginatedTable';
import { StatCard } from '@/components/ui/StatCard';
import { formatHeight } from '@/lib/format/height';
import { formatAmount } from '@/lib/format/amount';
import { shortenMiddle } from '@/lib/format/address';
import {
  useAccountPayouts,
  useAccountPayoutSummary,
  type SettlementPayoutsResponse,
} from '@/lib/api/queries';

type Payout = SettlementPayoutsResponse['data'][number];

/**
 * Rewards received by an address.
 *
 * On this chain participants never claim: x/mining settlement pays them directly inside a
 * MsgSubmitSettlementChunk, so an address's reward history IS its set of payout lines. This is
 * the end-user-facing counterpart to the operator-facing entitlement view on a CoreSlot.
 */
export function RewardsReceivedSection({ address }: { address: string }) {
  const summary = useAccountPayoutSummary(address);
  const query = useAccountPayouts(address);

  const s = summary.data?.data;
  const total = s ? formatAmount(s.totalAmount, s.denom ?? 'utwlt') : null;

  const columns: Column<Payout>[] = [
    {
      header: 'Amount',
      mono: true,
      cell: (p) => {
        const a = formatAmount(p.amount, p.denom);
        return `${a.display} ${a.symbol}`;
      },
    },
    {
      header: 'Slot',
      mono: true,
      cell: (p) => (
        <Link
          href={`/coreslots/${encodeURIComponent(p.slotId)}`}
          className="text-primary hover:text-primary-light"
        >
          {p.slotId}
        </Link>
      ),
    },
    // Epoch ordinals render verbatim — formatHeight is for block heights, not epoch numbers.
    { header: 'Epoch', mono: true, cell: (p) => p.epochNumber },
    { header: 'Height', mono: true, cell: (p) => formatHeight(p.height) },
    {
      header: 'Tx',
      mono: true,
      cell: (p) => (
        <Link
          href={`/txs/${encodeURIComponent(p.txHash)}`}
          className="font-mono text-primary hover:text-primary-light"
          title={p.txHash}
        >
          {shortenMiddle(p.txHash)}
        </Link>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={HandCoins}
        iconTone="rewards"
        title="Rewards received"
      />
      <CardBody>
        <p className="mb-3 text-sm text-text-muted">
          Settlement payouts to this address. There is no claim step on this chain — x/mining
          pays participants directly inside a settlement chunk.
        </p>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            label="Total received"
            value={total ? `${total.display} ${total.symbol}` : summary.isPending ? '…' : '—'}
            hint="across all settlements"
          />
          <StatCard
            label="Payouts"
            value={s ? formatHeight(s.payoutCount) : summary.isPending ? '…' : '—'}
            hint="settlement chunk lines"
          />
        </div>
        <PaginatedTable
          query={query}
          columns={columns}
          rowKey={(p) => p.id}
          context="Rewards received"
          emptyMessage="No settlement rewards received by this address."
        />
      </CardBody>
    </Card>
  );
}
