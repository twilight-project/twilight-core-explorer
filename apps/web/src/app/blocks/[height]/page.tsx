import { BlockDetail } from '@/components/blocks/BlockDetail';

export const metadata = { title: 'Block' };

export default function BlockDetailPage({
  params,
  searchParams,
}: {
  params: { height: string };
  searchParams: { tab?: string | string[] };
}) {
  return <BlockDetail height={params.height} tab={searchParams.tab} />;
}
