import { ExplorerTabs } from '@/components/explorer/ExplorerTabs';
import { AccountsAggregateStrip } from '@/components/accounts/AccountsAggregateStrip';
import { AccountsList } from '@/components/accounts/AccountsList';

export const metadata = { title: 'Accounts' };

// Explorer stream: deliberately "Observed accounts," NOT a wealth leaderboard — the list is
// ordered by observation, never by balance, and balances are per-address samples (on the
// detail page), not a global holdings ranking.
export default function AccountsPage() {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2.5">
        <h1 className="font-serif text-3xl text-text">Observed accounts</h1>
        <p className="max-w-2xl text-sm text-text-muted">
          An observation log, not a holdings ranking — ordering never implies balance.
        </p>
      </div>
      <ExplorerTabs />
      <AccountsAggregateStrip />
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text">Observed accounts</h2>
        <AccountsList />
      </div>
    </div>
  );
}
