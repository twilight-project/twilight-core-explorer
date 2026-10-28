import { OperatorProfile } from '@/components/operators/OperatorProfile';

export const metadata = { title: 'Operator profile' };

// The "mine with us" deep link: an operator hands out /operators/{slot number}.
export default async function OperatorBySlotPage(props: {
  params: Promise<{ slotId: string }>;
}) {
  const params = await props.params;
  return <OperatorProfile slotId={params.slotId} />;
}
