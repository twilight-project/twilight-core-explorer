import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { AccountsList } from '@/components/accounts/AccountsList';

export const metadata = { title: 'Accounts' };

// Airy redesign — deliberately "Observed accounts," NOT a wealth leaderboard (per the review): the
// list is ordered by observation, never by balance, and balances are per-address samples (on the
// detail page), not a global holdings ranking.
//
// Stat strip cards are all derivable from indexed account rows (counts, first/last-seen recency) →
// `preview` until aggregate endpoints land. No median-balance / holdings card — that would imply a
// complete global balance index we don't have.
export default function AccountsPage() {
  return (
    <div className="space-y-section">
      <PageHeader
        eyebrow="Accounts"
        title="Observed accounts"
        sub="Addresses seen by the indexer — first/last activity, transaction count, and kind. This is an observation log, not a holdings ranking; balances are per-address samples on each account's page."
      />

      <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
        <KpiCard preview label="Observed accounts" value="8,412" />
        <KpiCard preview label="Active (24h)" value="612" />
        <KpiCard preview label="New (24h)" value="47" />
        <KpiCard preview label="Module accounts" value="6" />
      </div>

      <Card>
        <CardHeader
          title="Observed accounts"
          action={<span className="font-mono text-xs text-text-muted">by observation</span>}
        />
        <CardBody>
          <AccountsList />
        </CardBody>
      </Card>
    </div>
  );
}
