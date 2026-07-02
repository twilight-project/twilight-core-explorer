import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { TxsList } from '@/components/txs/TxsList';
import { oneParam } from '@/lib/search-params';
import { coerceStatus, TX_STATUS_OPTIONS } from '@/lib/status-filters';

export const metadata = { title: 'Transactions' };

// Airy redesign — list-page pattern: header, a feasibility-gated stat strip, then the real
// transaction list (with its API-backed success/failed status filter) in a titled panel.
//
// Stat strip cards are all derivable from indexed tx/message rows (24h count, success/fail from the
// success flag, avg messages/tx) → shown as `preview` until aggregate endpoints land. Type-group
// filter chips (CoreSlot/Rewards/Bank/Claims) are deferred: /txs has no message-type param yet, and a
// non-functional filter would mislead — that's a next-iteration API addition, not a fake control.
export default function TxsPage({
  searchParams,
}: {
  searchParams: { status?: string | string[] };
}) {
  // Validate the raw URL param at the trust boundary — only success/failed reach the API filter.
  const status = coerceStatus(oneParam(searchParams.status), TX_STATUS_OPTIONS);
  return (
    <div className="space-y-section">
      <PageHeader
        eyebrow="Transactions"
        title="Transaction stream"
        sub="Every indexed transaction, newest first — hash, block, message type, and success. Filter by success or failure; type-group filters arrive with a message-type API param."
      />

      <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
        <KpiCard preview label="24h transactions" value="1,284" />
        <KpiCard preview label="Success rate" value="99.3" unit="%" />
        <KpiCard preview label="Failed (24h)" value="21" />
        <KpiCard preview label="Avg messages / tx" value="1.2" />
      </div>

      <Card>
        <CardHeader
          title="All transactions"
          action={<span className="font-mono text-xs text-text-muted">newest first · live</span>}
        />
        <CardBody>
          <TxsList status={status} />
        </CardBody>
      </Card>
    </div>
  );
}
