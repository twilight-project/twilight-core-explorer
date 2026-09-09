'use client';

import { Activity, ArrowLeftRight } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { QueryBoundary } from '@/components/QueryBoundary';
import { EmptyState } from '@/components/states/States';
import { BarsChart } from '@/components/charts/BarsChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { blockIntervals, blockTxCounts } from '@/components/charts/shape';
import { useLatestBlocks } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';

// Chart pair for the blocks page, fed by one shared "recent indexed blocks" window (polls with
// the other list surfaces). Mid-backfill these show the newest INDEXED window, which the page
// header/banner already qualifies.
const WINDOW = 60;

export function BlockCadencePanel() {
  const query = useLatestBlocks(WINDOW);
  return (
    <div className="grid gap-grid lg:grid-cols-2">
      <Card>
        <CardHeader
          icon={Activity}
          iconTone="infra"
          title="Block cadence"
          action={<span className="font-mono text-xs text-text-muted">last {WINDOW} indexed</span>}
        />
        <CardBody>
          <QueryBoundary query={query} context="Block cadence" loadingRows={4}>
            {(res) => {
              const points = blockIntervals(res.data);
              return points.length >= 2 ? (
                <TrendChart
                  points={points}
                  label={`Seconds between blocks over the last ${WINDOW} indexed blocks`}
                  tone="blue"
                  formatY={(v) => `${v}s`}
                  formatX={(x) => formatHeight(x)}
                  tooltip={(p) => `Block ${formatHeight(p.x)} — ${p.y.toFixed(1)}s after previous`}
                />
              ) : (
                <EmptyState message="Not enough indexed blocks to chart yet." />
              );
            }}
          </QueryBoundary>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          icon={ArrowLeftRight}
          iconTone="infra"
          title="Transactions per block"
          action={<span className="font-mono text-xs text-text-muted">last {WINDOW} indexed</span>}
        />
        <CardBody>
          <QueryBoundary query={query} context="Transactions per block" loadingRows={4}>
            {(res) => {
              const points = blockTxCounts(res.data);
              return points.length >= 2 ? (
                <BarsChart
                  bars={points.map((p) => ({
                    label: formatHeight(p.x),
                    value: p.y,
                    hint: `Block ${formatHeight(p.x)} — ${p.y} tx${p.y === 1 ? '' : 's'}`,
                  }))}
                  label={`Transactions per block over the last ${WINDOW} indexed blocks`}
                  tone="primary"
                />
              ) : (
                <EmptyState message="Not enough indexed blocks to chart yet." />
              );
            }}
          </QueryBoundary>
        </CardBody>
      </Card>
    </div>
  );
}
