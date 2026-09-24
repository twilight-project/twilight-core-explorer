'use client';

import { Users } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { BarsChart } from '@/components/charts/BarsChart';
import { useSlotSettlements } from '@/lib/api/queries';

/**
 * Participants paid per epoch for one slot — payout recipients per settlement, oldest→newest
 * over the settlements the indexer has observed. Chain-derived (payout rows), no caveat.
 */
export function CoreSlotParticipantsChart({ slotId }: { slotId: string }) {
  const query = useSlotSettlements(slotId);
  const rows = (query.data?.pages.flatMap((p) => p.data) ?? [])
    .filter((s) => s.payoutCount > 0)
    .slice(0, 60)
    .reverse();

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader icon={Users} iconTone="rewards" title="Participants per epoch" />
      <CardBody>
        <p className="mb-3 text-sm text-text-muted">
          How many addresses each settled epoch paid.
        </p>
        <BarsChart
          bars={rows.map((s) => ({
            label: s.epochNumber,
            value: s.payoutCount,
            hint: `epoch ${s.epochNumber}: ${s.payoutCount} recipients`,
          }))}
          label={`Participants paid per epoch for CoreSlot ${slotId}`}
          tone="primary"
        />
      </CardBody>
    </Card>
  );
}
