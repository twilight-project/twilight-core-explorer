'use client';

import { KpiCard } from '@/components/ui/KpiCard';
import { useBlocksAggregate } from '@/lib/api/queries';

// Real replacement for the Blocks preview strip — the /blocks/aggregate windowed stats. Pending -> "…",
// uncomputable (young chain, < 2 timed blocks) -> "—" (never a guessed 0). Locale is pinned so the
// grouped numbers are deterministic (this is a client-only render, but pinning avoids any drift).
export function BlocksAggregateStrip() {
  const query = useBlocksAggregate();
  const d = query.data?.data;
  const dash = query.isPending ? '…' : '—';
  const windowLabel = d
    ? `over last ${d.blocksInWindow.toLocaleString('en-US')} blocks`
    : 'windowed sample';

  return (
    <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
      <KpiCard
        label="Avg block time"
        value={d?.avgBlockTimeSeconds != null ? d.avgBlockTimeSeconds.toFixed(2) : dash}
        unit={d?.avgBlockTimeSeconds != null ? 's' : undefined}
        sub={windowLabel}
      />
      <KpiCard
        label="Txs / block"
        value={d?.avgTxsPerBlock != null ? d.avgTxsPerBlock.toFixed(1) : dash}
        unit={d?.avgTxsPerBlock != null ? 'avg' : undefined}
        sub={d ? `${d.totalTxs.toLocaleString('en-US')} txs in window` : windowLabel}
      />
      <KpiCard
        label="Blocks / day"
        value={d?.blocksPerDay != null ? d.blocksPerDay.toLocaleString('en-US') : dash}
        sub="at current cadence"
      />
      <KpiCard
        label="Unique proposers"
        value={d ? d.uniqueProposers : dash}
        sub={windowLabel}
      />
    </div>
  );
}
