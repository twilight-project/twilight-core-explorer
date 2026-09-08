'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { useLivenessRisk, useProjections, useRewardsEpochs, useStatus } from '@/lib/api/queries';
import { deriveIndexerFreshness } from '@/lib/freshness';
import { formatHeight } from '@/lib/format/height';
import { formatRelativeTime } from '@/lib/format/time';
import { statusTone, type BadgeTone } from '@/lib/format/status';

// Redesign: ONE verdict line replaces the 8-KPI grid + 5-item freshness strip. The verdict is
// DERIVED FROM REAL health (same logic as the old OverviewHeader pill — never hardcoded), the
// sentence carries the numbers inside prose, and the full freshness grid hides behind a
// disclosure for the operators who want it.
const DOT: Record<BadgeTone, string> = {
  success: 'bg-accent-green shadow-[0_0_0_4px_rgba(61,220,151,.15)]',
  warning: 'bg-accent-yellow shadow-[0_0_0_4px_rgba(255,181,112,.15)]',
  danger: 'bg-accent-red shadow-[0_0_0_4px_rgba(255,107,107,.15)]',
  neutral: 'bg-text-muted',
  info: 'bg-primary',
};

function FreshCell({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  tone?: BadgeTone;
}) {
  const subColor =
    tone === 'success'
      ? 'text-accent-green'
      : tone === 'warning'
        ? 'text-accent-yellow'
        : tone === 'danger'
          ? 'text-accent-red'
          : 'text-text-muted';
  return (
    <div className="bg-background-secondary px-4 py-3.5">
      <div className="text-[11px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1.5 font-mono text-base text-text">{value}</div>
      {sub ? <div className={clsx('mt-0.5 text-xs', subColor)}>{sub}</div> : null}
    </div>
  );
}

export function VerdictBlock() {
  const status = useStatus();
  const liveness = useLivenessRisk();
  const projections = useProjections();
  const epochs = useRewardsEpochs();
  const [open, setOpen] = useState(false);

  const indexer = status.data?.data.indexer;
  const risk = liveness.data?.data;
  const projList = projections.data?.data;
  const projErrors = projList ? projList.filter((p) => p.error !== null).length : 0;
  const latestEpoch = epochs.data?.pages[0]?.data[0];
  const synced = deriveIndexerFreshness(indexer ?? null).kind === 'fresh';

  const indexerTone = statusTone(indexer?.status);
  const riskTone = risk ? statusTone(risk.haltRiskLevel) : 'success';

  let verdict: { label: string; tone: BadgeTone };
  if (!indexer) {
    verdict = { label: status.isError ? 'Status unavailable' : 'Loading…', tone: 'neutral' };
  } else if (indexerTone !== 'success' || !synced) {
    verdict = { label: synced ? `Indexer ${indexer.status}` : 'Indexer catching up', tone: 'warning' };
  } else if (riskTone === 'danger' || riskTone === 'warning') {
    verdict = { label: `Halt risk: ${risk?.haltRiskLevel}`, tone: riskTone };
  } else {
    verdict = { label: 'Network is healthy', tone: 'success' };
  }

  const sentenceParts: string[] = [];
  if (indexer) {
    const ago =
      indexer.freshnessSeconds !== null && indexer.freshnessSeconds !== undefined
        ? `${indexer.freshnessSeconds} second${indexer.freshnessSeconds === 1 ? '' : 's'} ago`
        : 'just now';
    sentenceParts.push(`Block ${formatHeight(indexer.lastIndexedHeight)} indexed ${ago}.`);
  }
  if (risk) {
    sentenceParts.push(
      risk.healthySlotCount === risk.activeSlotCount
        ? `All ${risk.activeSlotCount} CoreSlots are signing;`
        : `${risk.healthySlotCount} of ${risk.activeSlotCount} CoreSlots are healthy;`,
    );
  }
  if (latestEpoch) {
    const when = latestEpoch.blockTime ? ` ${formatRelativeTime(latestEpoch.blockTime)}` : '';
    sentenceParts.push(`reward epoch ${latestEpoch.epochNumber} closed${when}.`);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={clsx('h-2.5 w-2.5 rounded-full', DOT[verdict.tone])} />
        <h1 className="font-serif text-3xl tracking-tight text-text">{verdict.label}</h1>
      </div>
      {sentenceParts.length > 0 ? (
        <p className="max-w-2xl text-[15px] leading-relaxed text-text-secondary">
          {sentenceParts.join(' ')}
        </p>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 self-start text-sm text-text-muted hover:text-text"
      >
        <span
          aria-hidden="true"
          className={clsx('inline-block transition-transform duration-150', open && 'rotate-90')}
        >
          ›
        </span>
        Indexer &amp; projection details
      </button>
      {open ? (
        <div className="grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-card-border bg-card-border sm:grid-cols-3 lg:grid-cols-5">
          <FreshCell
            label="Chain tip"
            value={indexer ? formatHeight(indexer.latestChainHeight) : '…'}
            sub="from node"
          />
          <FreshCell
            label="Indexer head"
            value={indexer ? formatHeight(indexer.lastIndexedHeight) : '…'}
            sub={indexer?.status}
            tone={indexerTone}
          />
          <FreshCell
            label="Lag"
            value={indexer ? `${formatHeight(indexer.lagBlocks)} blk` : '…'}
            sub={synced ? 'synced' : 'behind'}
            tone={synced ? 'success' : 'warning'}
          />
          <FreshCell
            label="Projections"
            value={projList ? String(projList.length) : '…'}
            sub={projList ? (projErrors === 0 ? 'all clean' : `${projErrors} erroring`) : undefined}
            tone={projList ? (projErrors === 0 ? 'success' : 'danger') : 'neutral'}
          />
          <FreshCell
            label="Halt risk"
            value={risk ? risk.haltRiskLevel : '…'}
            sub={risk ? `${risk.availableSlotCount}/${risk.activeSlotCount} available` : undefined}
            tone={riskTone}
          />
        </div>
      ) : null}
    </div>
  );
}
