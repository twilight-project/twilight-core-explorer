import { OperatorData } from '@/components/operators/OperatorData';

export const metadata = { title: 'Operator data' };

// The full per-epoch ledger for one operator: settlements, clock, draws, slot detail.
export default async function OperatorDataPage(props: {
  params: Promise<{ slotId: string }>;
}) {
  const params = await props.params;
  return <OperatorData slotId={params.slotId} />;
}
