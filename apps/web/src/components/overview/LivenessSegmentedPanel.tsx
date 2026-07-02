'use client';

import { QueryBoundary } from '@/components/QueryBoundary';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SegmentedBar } from '@/components/ui/SegmentedBar';
import { ApiError, ERROR_CODES } from '@/lib/api/client';
import { useLivenessRisk } from '@/lib/api/queries';
import { statusTone } from '@/lib/format/status';
import { bpsToPercent } from '@/lib/format/bps';

// Redesigned liveness panel: a large available-signing-power figure, a real 3-segment health bar
// (healthy / on-watch / down slot COUNTS — real, zero segments omitted), a legend, and the halt-risk
// pill. Replaces the mock "99.2% + at-risk list" with our actual liveness-risk snapshot fields.
function LegendDot({ className, label, value }: { className: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={'h-2 w-2 rounded-full ' + className} />
      <span className="text-text-secondary">{label}</span>
      <span className="ml-auto font-mono text-text">{value}</span>
    </div>
  );
}

export function LivenessSegmentedPanel() {
  const query = useLivenessRisk();
  // A 404 is "no snapshot yet" — the same soft state the /liveness page and the old panel use.
  const is404 =
    query.isError && query.error instanceof ApiError && query.error.code === ERROR_CODES.notFound;

  return (
    <Card>
      <CardHeader title="Network liveness risk" href="/liveness" linkLabel="Open liveness" />
      <CardBody>
        {is404 ? (
          <div className="text-sm text-text-muted">No liveness snapshot yet.</div>
        ) : (
          <QueryBoundary query={query} context="Liveness risk" loadingRows={3}>
            {(res) => {
              const d = res.data;
              return (
                <div className="space-y-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="font-mono text-metric font-semibold tracking-tight text-accent-green">
                        {bpsToPercent(d.availablePowerBps)}
                      </div>
                      <div className="mt-1 text-xs text-text-muted">available signing power</div>
                    </div>
                    <Badge tone={statusTone(d.haltRiskLevel)}>halt risk: {d.haltRiskLevel}</Badge>
                  </div>

                  <SegmentedBar
                    segments={[
                      { label: 'Healthy', value: d.healthySlotCount, className: 'bg-accent-green' },
                      { label: 'On watch', value: d.degradedSlotCount, className: 'bg-accent-yellow' },
                      { label: 'Down', value: d.downSlotCount, className: 'bg-accent-red' },
                    ]}
                  />

                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-4">
                    <LegendDot className="bg-accent-green" label="Healthy" value={d.healthySlotCount} />
                    <LegendDot className="bg-accent-yellow" label="On watch" value={d.degradedSlotCount} />
                    <LegendDot className="bg-accent-red" label="Down" value={d.downSlotCount} />
                  </div>

                  {d.haltRiskReason ? (
                    <div className="text-xs text-text-muted">{d.haltRiskReason}</div>
                  ) : null}
                </div>
              );
            }}
          </QueryBoundary>
        )}
      </CardBody>
    </Card>
  );
}
