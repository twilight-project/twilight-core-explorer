import { TxDetail } from '@/components/txs/TxDetail';

export const metadata = { title: 'Transaction' };

export default async function TxDetailPage(props: {
  params: Promise<{ hash: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  return <TxDetail hash={params.hash} tab={searchParams.tab} />;
}
