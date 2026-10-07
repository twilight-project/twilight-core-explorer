'use client';

import { OperatorSubpageHeader } from './OperatorShell';
import { OperatorTrackRecord } from './OperatorTrackRecord';
import { OperatorClockPanel } from './OperatorClockPanel';
import { OperatorDrawPanel } from './OperatorDrawPanel';
import { CoreSlotDetail } from '@/components/coreslots/CoreSlotDetail';
import { useSettlementStatus } from '@/lib/api/queries';

// Operator Data: the full per-epoch ledger — every settlement with its verification mark, the
// live epoch clock, the newest draw record, then the complete slot detail (signing evidence,
// liveness, authority history, entitlements, raw). The WHO/HOW-TO layer is the Details tab.

const FULL_ROWS = 40;

export function OperatorData({ slotId }: { slotId: string }) {
  const settlements = useSettlementStatus({ slotId });
  const settledEpochs = (settlements.data?.pages.flatMap((p) => p.data) ?? [])
    .filter((r) => r.settled)
    .map((r) => r.epochNumber);

  return (
    <div className="flex flex-col gap-7">
      <OperatorSubpageHeader
        slotId={slotId}
        active="data"
        caption="Every epoch this slot owed and how it settled, checked against the operator's own published figures — plus the live clock, the selection draw and the full slot detail."
      />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <OperatorTrackRecord
          slotId={slotId}
          rows={FULL_ROWS}
          footerHref={`/economy?tab=settlements&slotId=${encodeURIComponent(slotId)}`}
        />
        <div className="flex min-w-0 flex-col gap-6">
          <OperatorClockPanel slotId={slotId} />
          {settledEpochs[0] !== undefined ? (
            <OperatorDrawPanel slotId={slotId} epoch={settledEpochs[0]} />
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Full slot detail</h2>
        <CoreSlotDetail slotId={slotId} embedded />
      </div>
    </div>
  );
}
