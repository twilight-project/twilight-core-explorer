import { OperatorDetails } from '@/components/operators/OperatorDetails';

export const metadata = { title: 'Operator details' };

// Who runs the slot, how rewards are shared, and how to connect.
export default function OperatorDetailsPage({ params }: { params: { slotId: string } }) {
  return <OperatorDetails slotId={params.slotId} />;
}
