'use client';

import { KpiCard } from '@/components/ui/KpiCard';
import { useAccountsAggregate } from '@/lib/api/queries';

// Real replacement for the Accounts preview strip — /accounts/aggregate global registry counts.
// Deliberately counts only (no "24h"): firstSeen/lastSeen are heights, not timestamps, so a time
// window isn't sourceable. Pending -> "…", null avg -> "—" (never a guessed 0).
export function AccountsAggregateStrip() {
  const query = useAccountsAggregate();
  const d = query.data?.data;
  const dash = query.isPending ? '…' : '—';

  return (
    <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
      <KpiCard
        label="Observed accounts"
        value={d ? d.totalAccounts.toLocaleString('en-US') : dash}
        sub="addresses seen"
      />
      <KpiCard
        label="Labelled"
        value={d ? d.labelledAccounts.toLocaleString('en-US') : dash}
        sub="carry a known kind"
      />
      <KpiCard
        label="Module accounts"
        value={d ? d.moduleAccounts.toLocaleString('en-US') : dash}
        sub="protocol-owned"
      />
      <KpiCard
        label="Avg txs / account"
        value={d?.avgTxCount != null ? d.avgTxCount.toFixed(1) : dash}
        sub="observed activity"
      />
    </div>
  );
}
