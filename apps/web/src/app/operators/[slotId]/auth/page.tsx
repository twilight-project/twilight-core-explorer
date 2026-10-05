import { OperatorAuth } from '@/components/operators/OperatorAuth';

export const metadata = { title: 'Authentication' };

// How a participant signs in to this operator: the operator's own OAuth AS metadata and
// signing keys, sampled and served attested.
export default function OperatorAuthPage({ params }: { params: { slotId: string } }) {
  return <OperatorAuth slotId={params.slotId} />;
}
