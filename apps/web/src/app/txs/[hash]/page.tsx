import { TxDetail } from '@/components/txs/TxDetail';

export const metadata = { title: 'Transaction' };

export default function TxDetailPage({
  params,
  searchParams,
}: {
  params: { hash: string };
  searchParams: { tab?: string | string[] };
}) {
  return <TxDetail hash={params.hash} tab={searchParams.tab} />;
}
