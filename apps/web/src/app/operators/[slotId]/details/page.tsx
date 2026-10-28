import { OperatorDetails } from '@/components/operators/OperatorDetails';

export const metadata = { title: 'Operator details' };

// Who runs the slot, how rewards are shared, and how to connect.
export default async function OperatorDetailsPage(props: {
  params: Promise<{ slotId: string }>;
}) {
  const params = await props.params;
  return <OperatorDetails slotId={params.slotId} />;
}
