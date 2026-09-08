import { CoreSlotDetail } from '@/components/coreslots/CoreSlotDetail';

export const metadata = { title: 'CoreSlot' };

export default function CoreSlotDetailPage({
  params,
  searchParams,
}: {
  params: { slotId: string };
  searchParams: { tab?: string | string[] };
}) {
  return <CoreSlotDetail slotId={params.slotId} tab={searchParams.tab} />;
}
