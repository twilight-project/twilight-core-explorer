import { SettlementDetail } from '@/components/mining/SettlementDetail';

export const metadata = { title: 'Settlement' };

export default async function SettlementPage(props: {
  params: Promise<{ slotId: string; epoch: string }>;
}) {
  const params = await props.params;
  return <SettlementDetail slotId={params.slotId} epoch={params.epoch} />;
}
