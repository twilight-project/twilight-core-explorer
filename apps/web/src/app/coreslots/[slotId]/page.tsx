import { CoreSlotDetail } from '@/components/coreslots/CoreSlotDetail';

export const metadata = { title: 'CoreSlot' };

export default async function CoreSlotDetailPage(props: {
  params: Promise<{ slotId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  return <CoreSlotDetail slotId={params.slotId} tab={searchParams.tab} />;
}
