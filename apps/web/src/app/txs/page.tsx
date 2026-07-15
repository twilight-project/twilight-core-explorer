import { ArrowLeftRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { TxsAggregateStrip } from '@/components/txs/TxsAggregateStrip';
import { TxsList } from '@/components/txs/TxsList';
import { LiveLabel } from '@/components/freshness/LiveLabel';
import { oneParam } from '@/lib/search-params';
import { coerceStatus, TX_STATUS_OPTIONS } from '@/lib/status-filters';

export const metadata = { title: 'Transactions' };

// Airy redesign — list-page pattern: header, a real windowed stat strip (GET /txs/aggregate), then
// the real transaction list (with its API-backed success/failed status filter) in a titled panel.
// Type-group filter chips (CoreSlot/Rewards/Bank/Claims) remain deferred: /txs has no message-type
// param yet, and a non-functional filter would mislead — that's a separate next API addition.
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
        icon={ArrowLeftRight}
        iconTone="infra"
        eyebrow="Transactions"
        title="Transaction stream"
        sub="Every indexed transaction, newest first — hash, block, message type, and success. Filter by success or failure; type-group filters arrive with a message-type API param."
      />

      <TxsAggregateStrip />

      <Card>
        <CardHeader
          icon={ArrowLeftRight}
          iconTone="infra"
          title="All transactions"
          action={<LiveLabel />}
        />
        <CardBody>
          <TxsList status={status} />
        </CardBody>
      </Card>
    </div>
  );
}
