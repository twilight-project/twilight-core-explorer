'use client';

import { Badge } from '@/components/ui/Badge';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { DetailShell } from '@/components/detail/DetailShell';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/States';
import { OperatorProfile } from '@/components/operators/OperatorProfile';
import { useOperatorResolution } from '@/lib/api/queries';
import type { OperatorRole } from '@/lib/operator-resolver';

const ROLE_LABEL: Record<OperatorRole, string> = {
  operator: 'operator address',
  consensus: 'consensus address',
  payout: 'payout address',
};

// The operator page (phase 15): resolve an address -> its CoreSlot (by operator/consensus/
// payout role — one operator = one slot; >1 is a surfaced anomaly), then render the full
// Operator Profile for that slot. The profile is also reachable directly at /operators/[slotId].
export function OperatorView({ address }: { address: string }) {
  const resolution = useOperatorResolution(address);
  const slots = resolution.data?.slots ?? [];
  const primarySlot = slots[0];

  if (resolution.isPending) {
    return (
      <DetailShell title="Operator" backHref="/slots?tab=operators" backLabel="Operators">
        <LoadingState rows={4} />
      </DetailShell>
    );
  }
  if (resolution.isError) {
    return (
      <DetailShell title="Operator" backHref="/slots?tab=operators" backLabel="Operators">
        <ErrorState error={resolution.error} context="Operator" />
      </DetailShell>
    );
  }

  const { matchedRole } = resolution.data;
  if (matchedRole === null || primarySlot === undefined) {
    return (
      <DetailShell title="Operator" backHref="/slots?tab=operators" backLabel="Operators">
        <EmptyState message="No CoreSlot found for this address." />
      </DetailShell>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <Badge tone="info">matched by {ROLE_LABEL[matchedRole]}</Badge>
        <span>searched:</span>
        <MonoCopy value={address} head={14} tail={8} label="searched address" />
        {slots.length > 1 ? (
          <span className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-1 text-primary">
            Multiple CoreSlots matched (unexpected — one operator should own one CoreSlot).
            Showing slot {primarySlot.slotId}.
          </span>
        ) : null}
      </div>
      <OperatorProfile slotId={primarySlot.slotId} />
    </div>
  );
}
