'use client';

import { Network } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { QueryBoundary } from '@/components/QueryBoundary';
import { EmptyState } from '@/components/states/States';
import { BarsChart } from '@/components/charts/BarsChart';
import { useProposers } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';

// Blocks-proposed distribution across the CoreSlot set (single measure — identity lives on the
// axis and tooltip, one hue). The leaderboard table beside it is the accessible/table view.
export function ProposerDistributionChart() {
  const query = useProposers();
  return (
    <Card>
      <CardHeader
        icon={Network}
        iconTone="coreslot"
        title="Proposer distribution"
        action={<span className="font-mono text-xs text-text-muted">indexed blocks</span>}
      />
      <CardBody>
        <QueryBoundary query={query} context="Proposer distribution" loadingRows={4}>
          {(res) =>
            res.data.length > 0 ? (
              <BarsChart
                bars={res.data.map((p) => ({
                  label: `#${formatHeight(p.slotId)}`,
                  value: p.blocksProposed,
                  hint: `CoreSlot #${formatHeight(p.slotId)} — ${p.blocksProposed.toLocaleString('en-US')} blocks proposed`,
                }))}
                label="Blocks proposed per CoreSlot"
                tone="blue"
                formatY={(v) => v.toLocaleString('en-US')}
              />
            ) : (
              <EmptyState message="No proposer attribution yet." />
            )
          }
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}
