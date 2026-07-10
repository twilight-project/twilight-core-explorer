'use client';

import { ArrowLeftRight, CircleCheck, CircleX, Layers } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { useTxsAggregate } from '@/lib/api/queries';

// Real replacement for the Transactions preview strip — /txs/aggregate windowed stats. Pending -> "…",
// empty window -> "—" (never a guessed 0). Locale pinned for deterministic grouping.
export function TxsAggregateStrip() {
  const query = useTxsAggregate();
  const d = query.data?.data;
  const dash = query.isPending ? '…' : '—';
  const windowLabel = d
    ? `over last ${d.txsInWindow.toLocaleString('en-US')} txs`
    : 'windowed sample';

  return (
    <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
      <KpiCard
        icon={ArrowLeftRight}
        iconTone="infra"
        label="Transactions (window)"
        value={d ? d.txsInWindow.toLocaleString('en-US') : dash}
        sub={d ? `${d.totalMessages.toLocaleString('en-US')} messages` : windowLabel}
      />
      <KpiCard
        icon={CircleCheck}
        iconTone="liveness"
        label="Success rate"
        value={d?.successRate != null ? d.successRate.toFixed(1) : dash}
        unit={d?.successRate != null ? '%' : undefined}
        deltaTone={d && d.successRate != null && d.successRate >= 99 ? 'success' : 'neutral'}
        delta={d ? `${d.successCount.toLocaleString('en-US')} ok` : undefined}
        sub={windowLabel}
      />
      <KpiCard
        icon={CircleX}
        iconTone="risk"
        label="Failed"
        value={d ? d.failedCount.toLocaleString('en-US') : dash}
        delta={d && d.failedCount > 0 ? 'attention' : undefined}
        deltaTone={d && d.failedCount > 0 ? 'danger' : 'neutral'}
        sub={windowLabel}
      />
      <KpiCard
        icon={Layers}
        iconTone="infra"
        label="Avg messages / tx"
        value={d?.avgMessagesPerTx != null ? d.avgMessagesPerTx.toFixed(1) : dash}
        sub={windowLabel}
      />
    </div>
  );
}
