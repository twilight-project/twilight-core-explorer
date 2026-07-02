import { PageHeader } from '@/components/ui/PageHeader';
import { LivenessOverview } from '@/components/liveness/LivenessOverview';
import { PreviewHeatmap } from '@/components/liveness/PreviewHeatmap';
import { PerSlotHealthTable } from '@/components/liveness/PerSlotHealthTable';

export const metadata = { title: 'Liveness' };

// Airy redesign — the deep signing-behavior view (distinct from Network's structural summary): the
// real halt/liveness-risk overview, the intended signing heatmap (preview until a per-block endpoint
// lands), and the real per-CoreSlot health table (uptime + missed-streak).
export default function LivenessPage() {
  return (
    <div className="space-y-section">
      <PageHeader
        eyebrow="Liveness"
        title="Signing & downtime monitor"
        sub="Per-CoreSlot signing health, uptime, and missed-block streaks — the deep operator view of who is signing and where downtime is emerging."
      />
      <LivenessOverview />
      <PreviewHeatmap />
      <PerSlotHealthTable />
    </div>
  );
}
