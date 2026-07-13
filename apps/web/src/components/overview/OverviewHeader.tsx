'use client';

import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { useLivenessRisk, useStatus } from '@/lib/api/queries';
import { statusTone } from '@/lib/format/status';

// Overview page header. The right-side status pill is DERIVED FROM REAL health, never hardcoded:
// "All systems nominal" only shows when the indexer is synced AND halt risk is not degraded/down.
// Otherwise it surfaces the actual failing signal, so the airy header can't lie about health.
export function OverviewHeader() {
  const status = useStatus();
  const liveness = useLivenessRisk();

  const indexer = status.data?.data.indexer;
  const risk = liveness.data?.data;

  const indexerTone = statusTone(indexer?.status);
  const riskTone = risk ? statusTone(risk.haltRiskLevel) : 'success';

  let pill: { label: string; tone: ReturnType<typeof statusTone> };
  if (!indexer) {
    pill = { label: status.isError ? 'Status unavailable' : 'Loading…', tone: 'neutral' };
  } else if (indexerTone !== 'success') {
    pill = { label: `Indexer ${indexer.status}`, tone: indexerTone };
  } else if (riskTone === 'danger' || riskTone === 'warning') {
    pill = { label: `Halt risk: ${risk?.haltRiskLevel}`, tone: riskTone };
  } else {
    pill = { label: 'All systems nominal', tone: 'success' };
  }

  const freshness = indexer?.freshnessSeconds;

  return (
    <PageHeader
      icon={LayoutDashboard}
      iconTone="infra"
      eyebrow="Network Overview"
      title="Twilight Core operations console"
      sub="Chain status, indexer freshness, block & transaction activity, CoreSlot signing health, halt-risk, and sampled supply — the operator's answer to “is the network healthy and current?”"
      actions={
        <div className="flex items-center gap-3">
          <Badge tone={pill.tone}>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={
                  'h-1.5 w-1.5 rounded-full ' +
                  (pill.tone === 'success'
                    ? 'bg-accent-green'
                    : pill.tone === 'warning'
                      ? 'bg-accent-yellow'
                      : pill.tone === 'danger'
                        ? 'bg-accent-red'
                        : 'bg-text-muted')
                }
              />
              {pill.label}
            </span>
          </Badge>
          {freshness !== null && freshness !== undefined ? (
            <span className="font-mono text-xs text-text-muted">updated {freshness}s ago</span>
          ) : null}
        </div>
      }
    />
  );
}
