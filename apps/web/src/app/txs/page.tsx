import { ArrowLeftRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { TxsAggregateStrip } from '@/components/txs/TxsAggregateStrip';
import { TxsList } from '@/components/txs/TxsList';
import { LiveLabel } from '@/components/freshness/LiveLabel';
import { oneParam } from '@/lib/search-params';
import { coerceStatus, TX_STATUS_OPTIONS, TX_TYPE_GROUP_OPTIONS } from '@/lib/status-filters';

export const metadata = { title: 'Transactions' };

// Airy redesign — list-page pattern: header, a real windowed stat strip (GET /txs/aggregate), then
// the real transaction list with its API-backed success/failed status filter AND the message-type
// group filter (?type= → the /txs typeGroup enum, matched server-side against Message.typeUrl).
export default function TxsPage({
  searchParams,
}: {
  searchParams: { status?: string | string[]; type?: string | string[] };
}) {
  // Validate the raw URL params at the trust boundary — only canonical values reach the API.
  const status = coerceStatus(oneParam(searchParams.status), TX_STATUS_OPTIONS);
  const typeGroup = coerceStatus(oneParam(searchParams.type), TX_TYPE_GROUP_OPTIONS);
  return (
    <div className="space-y-section">
      <PageHeader
        icon={ArrowLeftRight}
        iconTone="infra"
        eyebrow="Transactions"
        title="Transaction stream"
        sub="Every indexed transaction, newest first — hash, block, message type, and success. Filter by success/failure and by message-type group (CoreSlot / Rewards / Bank)."
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
          <TxsList status={status} typeGroup={typeGroup} />
        </CardBody>
      </Card>
    </div>
  );
}
