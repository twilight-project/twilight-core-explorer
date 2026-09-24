import { TxsAggregateStrip } from '@/components/txs/TxsAggregateStrip';
import { TxsList } from '@/components/txs/TxsList';
import { LiveLabel } from '@/components/freshness/LiveLabel';
import { oneParam } from '@/lib/search-params';
import { coerceStatus, TX_STATUS_OPTIONS, TX_TYPE_GROUP_OPTIONS } from '@/lib/status-filters';

export const metadata = { title: 'Transactions' };

// Explorer stream: shared tab row, then the real transaction list with its API-backed
// success/failed status filter AND the message-type group filter (?type= → the /txs typeGroup
// enum, matched server-side against Message.typeUrl).
export default function TxsPage({
  searchParams,
}: {
  searchParams: { status?: string | string[]; type?: string | string[] };
}) {
  // Validate the raw URL params at the trust boundary — only canonical values reach the API.
  const status = coerceStatus(oneParam(searchParams.status), TX_STATUS_OPTIONS);
  const typeGroup = coerceStatus(oneParam(searchParams.type), TX_TYPE_GROUP_OPTIONS);
  return (
    <div className="flex flex-col gap-7">
      <h1 className="font-serif text-3xl text-text">Transactions</h1>
      <TxsAggregateStrip />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text">All transactions</h2>
          <LiveLabel />
        </div>
        <TxsList status={status} typeGroup={typeGroup} />
      </div>
    </div>
  );
}
