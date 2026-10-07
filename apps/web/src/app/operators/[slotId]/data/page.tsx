import { OperatorData } from '@/components/operators/OperatorData';

export const metadata = { title: 'Operator data' };

// The full per-epoch ledger for one operator: settlements, clock, draws, slot detail.
export default function OperatorDataPage({ params }: { params: { slotId: string } }) {
  return <OperatorData slotId={params.slotId} />;
}
