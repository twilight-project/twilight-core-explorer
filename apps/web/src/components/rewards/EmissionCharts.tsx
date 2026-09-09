'use client';

import { Award, TrendingUp } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingState } from '@/components/states/States';
import { BarsChart } from '@/components/charts/BarsChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { utwltToTwlt } from '@/components/charts/shape';
import { useRewardsEpochs } from '@/lib/api/queries';

// Emission charts over the newest page of finalized epochs (newest-first keyset page, reversed
// to chronological). Per-epoch and cumulative are different magnitudes of the same unit — two
// zero-based charts, never a dual axis. Amounts are TWLT (converted for plotting only).
const twlt = (v: number) => `${v.toLocaleString('en-US')} TWLT`;

export function EmissionCharts() {
  const query = useRewardsEpochs();
  if (query.isPending) {
    return (
      <div className="grid gap-grid lg:grid-cols-2">
        <LoadingState rows={4} />
        <LoadingState rows={4} />
      </div>
    );
  }
  // Chart layer stays quiet on error — the epochs table below carries the error state.
  if (query.isError) return null;

  const epochs = [...(query.data?.pages[0]?.data ?? [])].reverse();
  const perEpoch = epochs.flatMap((e) => {
    const v = utwltToTwlt(e.totalReward);
    return v === null ? [] : [{ label: e.epochNumber, value: v, hint: `Epoch ${e.epochNumber} — ${twlt(v)}` }];
  });
  const cumulative = epochs.flatMap((e) => {
    const v = utwltToTwlt(e.cumulativeEmitted);
    return v === null ? [] : [{ x: e.epochNumber, y: v }];
  });

  return (
    <div className="grid gap-grid lg:grid-cols-2">
      <Card>
        <CardHeader
          icon={Award}
          iconTone="rewards"
          title="Emission per epoch"
          action={<span className="font-mono text-xs text-text-muted">latest {epochs.length} epochs</span>}
        />
        <CardBody>
          {perEpoch.length > 0 ? (
            <BarsChart
              bars={perEpoch}
              label={`Reward emission per epoch over the latest ${epochs.length} finalized epochs`}
              tone="primary"
              formatY={twlt}
            />
          ) : (
            <EmptyState message="No finalized epochs to chart yet." />
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          icon={TrendingUp}
          iconTone="rewards"
          title="Cumulative emitted"
          action={<span className="font-mono text-xs text-text-muted">observed projection</span>}
        />
        <CardBody>
          {cumulative.length >= 2 ? (
            <TrendChart
              points={cumulative}
              label={`Cumulative TWLT emitted across the latest ${epochs.length} finalized epochs`}
              tone="green"
              area
              formatY={twlt}
              formatX={(x) => `epoch ${x}`}
              tooltip={(p) => `Epoch ${p.x} — ${twlt(p.y)} emitted in total`}
            />
          ) : (
            <EmptyState message="Not enough epochs to chart yet." />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
