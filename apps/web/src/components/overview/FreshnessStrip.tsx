'use client';

import { clsx } from 'clsx';
import { useProjections, useStatus } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { statusTone, type BadgeTone } from '@/lib/format/status';

// The redesign's "indexer & projection freshness" strip: a row of items each with a tone-colored
// left border, an uppercase label, a mono value (+ unit), and a muted sub. All real status fields.
const BORDER: Record<BadgeTone, string> = {
  neutral: 'border-l-border',
  success: 'border-l-accent-green',
  warning: 'border-l-accent-yellow',
  danger: 'border-l-accent-red',
  info: 'border-l-primary',
};

function FreshItem({
  label,
  value,
  unit,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  unit?: string | undefined;
  sub?: string | undefined;
  tone?: BadgeTone;
}) {
  return (
    <div className={clsx('rounded-lg border-l-2 bg-background-secondary px-4 py-3', BORDER[tone])}>
      <div className="text-[11px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 font-mono text-lg text-text">
        {value}
        {/* Same placeholder convention as KpiCard: no unit next to a "…" pending value. */}
        {unit && value !== '…' && value !== '—' ? (
          <span className="ml-1 text-xs text-text-muted">{unit}</span>
        ) : null}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-text-muted">{sub}</div> : null}
    </div>
  );
}

export function FreshnessStrip() {
  const status = useStatus();
  const projections = useProjections();

  const indexer = status.data?.data.indexer;
  const projList = projections.data?.data;
  const projErrors = projList ? projList.filter((p) => p.error !== null).length : 0;
  const synced = indexer?.lagBlocks === '0';

  return (
    <div className="grid grid-cols-2 gap-grid sm:grid-cols-3 lg:grid-cols-5">
      <FreshItem
        label="Chain tip"
        value={indexer ? formatHeight(indexer.latestChainHeight) : '…'}
        tone="success"
      />
      <FreshItem
        label="Indexer head"
        value={indexer ? formatHeight(indexer.lastIndexedHeight) : '…'}
        sub={indexer ? indexer.status : undefined}
        tone={statusTone(indexer?.status)}
      />
      <FreshItem
        label="Index lag"
        value={indexer ? formatHeight(indexer.lagBlocks) : '…'}
        unit="blk"
        tone={synced ? 'success' : 'warning'}
      />
      <FreshItem
        label="Projections"
        value={projList ? String(projList.length) : '…'}
        sub={
          projList
            ? projErrors === 0
              ? 'all reporting clean'
              : `${projErrors} reporting error`
            : undefined
        }
        tone={projList ? (projErrors === 0 ? 'success' : 'danger') : 'neutral'}
      />
      <FreshItem
        label="Last sync"
        value={
          indexer?.freshnessSeconds !== null && indexer?.freshnessSeconds !== undefined
            ? String(indexer.freshnessSeconds)
            : '…'
        }
        unit="s"
        tone="info"
      />
    </div>
  );
}
