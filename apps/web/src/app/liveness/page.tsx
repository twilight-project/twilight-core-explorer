import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LivenessOverview } from '@/components/liveness/LivenessOverview';
import { SigningHeatmap } from '@/components/liveness/SigningHeatmap';
import { PerSlotHealthTable } from '@/components/liveness/PerSlotHealthTable';

export const metadata = { title: 'Liveness' };

// Airy redesign — the deep signing-behavior view (distinct from Network's structural summary): the
// real halt/liveness-risk overview, the real per-block signing heatmap (GET /network/signing-heatmap),
// and the real per-CoreSlot health table (uptime + missed-streak).
export default function LivenessPage() {
  return (
    <div className="space-y-section">
      <PageHeader
        icon={Activity}
        iconTone="liveness"
        eyebrow="Liveness"
        title="Signing & downtime monitor"
        sub="Per-CoreSlot signing health, uptime, and missed-block streaks — the deep operator view of who is signing and where downtime is emerging."
      />
      <LivenessOverview />
      <SigningHeatmap />
      <PerSlotHealthTable />
    </div>
  );
}
