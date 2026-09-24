import { OperatorProfile } from '@/components/operators/OperatorProfile';

export const metadata = { title: 'Operator profile' };

// The "mine with us" deep link: an operator hands out /operators/{slot number}.
export default function OperatorBySlotPage({ params }: { params: { slotId: string } }) {
  return <OperatorProfile slotId={params.slotId} />;
}
