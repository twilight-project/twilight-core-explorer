import { Server } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { CoreSlotsSummaryStrip } from '@/components/coreslots/CoreSlotsSummaryStrip';
import { CoreSlotsList } from '@/components/coreslots/CoreSlotsList';
import { oneParam } from '@/lib/search-params';
import { coerceStatus, CORESLOT_STATUS_OPTIONS } from '@/lib/status-filters';

export const metadata = { title: 'CoreSlots' };

// Airy redesign — the CoreSlot registry: a real active-vs-registered summary strip over the full
// registry table (slot, operator, consensus, status, power, reward weight, created/removed height)
// with status filter + keyset pagination. Per-slot signing health lives on Liveness + the detail page.
export default function CoreSlotsPage({
  searchParams,
}: {
  searchParams: { status?: string | string[] };
}) {
  // Validate the raw URL param at the trust boundary: only canonical UPPERCASE enum values reach the
  // case-sensitive API filter; unknown/lowercase values normalize or drop to "All".
  const status = coerceStatus(oneParam(searchParams.status), CORESLOT_STATUS_OPTIONS);
  return (
    <div className="space-y-section">
      <PageHeader
        icon={Server}
        iconTone="coreslot"
        eyebrow="CoreSlots"
        title="Validator set & registry"
        sub="The CoreSlot PoA validator set — lifecycle, authority, consensus power, and reward weight. The registry keeps rotated-out slots; per-slot signing health lives on Liveness and each slot's detail page."
      />
      <CoreSlotsSummaryStrip />
      <Card>
        <CardHeader
          icon={Server}
          iconTone="coreslot"
          title="CoreSlot registry"
          action={<span className="font-mono text-xs text-text-muted">ranked by slot id</span>}
        />
        <CardBody>
          <CoreSlotsList status={status} />
        </CardBody>
      </Card>
    </div>
  );
}
