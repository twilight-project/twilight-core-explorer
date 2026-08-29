import { SettlementDetail } from '@/components/mining/SettlementDetail';

export const metadata = { title: 'Settlement' };

export default function SettlementPage({
  params,
}: {
  params: { slotId: string; epoch: string };
}) {
  return <SettlementDetail slotId={params.slotId} epoch={params.epoch} />;
}
