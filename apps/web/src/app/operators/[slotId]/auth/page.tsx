import { OperatorAuth } from '@/components/operators/OperatorAuth';

export const metadata = { title: 'Authentication' };

// How a participant signs in to this operator: the operator's own OAuth AS metadata and
// signing keys, sampled and served attested.
export default async function OperatorAuthPage(props: {
  params: Promise<{ slotId: string }>;
}) {
  const params = await props.params;
  return <OperatorAuth slotId={params.slotId} />;
}
