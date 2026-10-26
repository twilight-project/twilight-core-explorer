import { BlockDetail } from '@/components/blocks/BlockDetail';

export const metadata = { title: 'Block' };

export default async function BlockDetailPage(props: {
  params: Promise<{ height: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  return <BlockDetail height={params.height} tab={searchParams.tab} />;
}
