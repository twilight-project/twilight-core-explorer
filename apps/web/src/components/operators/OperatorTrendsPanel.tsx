'use client';

import { BarsChart } from '@/components/charts/BarsChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { Panel } from './Panel';
import { useSettlementStatusSeries, useSlotSettlementsSeries } from '@/lib/api/queries';
import { buildEpochSeries } from '@/lib/operator-series';

// Trends (overview): the three per-epoch series a table can't show at a glance —
// participation, budget utilization and settlement punctuality. Chain facts only; on slot 3
// the miners' arrival at epoch 1657 is the visible step in all three.

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
      {children}
    </span>
  );
}

export function OperatorTrendsPanel({ slotId }: { slotId: string }) {
  const statusQ = useSettlementStatusSeries(slotId);
  const activityQ = useSlotSettlementsSeries(slotId);

  if (statusQ.isPending || statusQ.isError || activityQ.isPending || activityQ.isError) {
    return null;
  }
  const series = buildEpochSeries(statusQ.data.data, activityQ.data.data);
  if (series.length < 2) return null; // same rule as the chart primitives

  const participantBars = series.map((r) => ({
    label: r.epoch,
    value: r.recipients,
    hint: `epoch ${r.epoch} · ${r.recipients} participant${r.recipients === 1 ? '' : 's'} paid`,
  }));
  const paidBars = series
    .filter((r) => r.paidPct !== null)
    .map((r) => ({
      label: r.epoch,
      value: r.paidPct as number,
      hint: `epoch ${r.epoch} · paid ${r.paidTwlt.toFixed(4)}${r.keptTwlt !== null ? ` / kept ${r.keptTwlt.toFixed(4)}` : ''} TWLT`,
    }));
  const latencyPoints = series
    .filter((r) => r.latency !== null)
    .map((r) => ({ x: r.epoch, y: r.latency as number }));

  return (
    <Panel
      title="Trends"
      meta={
        <>
          last {series.length} epochs owed · <span className="text-primary">chain</span>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Caption>Participants paid per epoch</Caption>
          <BarsChart
            bars={participantBars}
            label="Participants paid per epoch"
            formatY={(v) => String(Math.round(v))}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Caption>Share of budget paid, %</Caption>
          <BarsChart
            bars={paidBars}
            label="Share of each epoch's budget paid to participants"
            formatY={(v) => `${Math.round(v)}%`}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Caption>Settlement latency, blocks</Caption>
          <TrendChart
            points={latencyPoints}
            label="Blocks from epoch close to settlement"
            tone="blue"
            formatY={(v) => `+${Math.round(v)}`}
            tooltip={(p) => `epoch ${p.x} · settled +${Math.round(p.y)} blocks after close`}
          />
        </div>
      </div>
      <p className="pt-3 font-mono text-[11px] leading-relaxed text-text-muted">
        Recomputed from indexed settlements — owed epochs, who was paid, and how long the
        operator took. Unsettled epochs are omitted from the paid and latency charts.
      </p>
    </Panel>
  );
}
