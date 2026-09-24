'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { VerdictBlock } from './VerdictBlock';
import { AddressDoor } from './AddressDoor';
import { StatDoors } from './StatDoors';
import { LatestBlocksPanel, RecentTxPanel } from './ActivityPanels';
import { OverviewKpis } from './OverviewKpis';
import { LivenessSegmentedPanel } from './LivenessSegmentedPanel';
import { SupplyPanel } from './SupplyPanel';

type OverviewView = 'glance' | 'dashboard';
const STORAGE_KEY = 'overview.view';

// Two views over one Overview (Phase 14a §3.2). Glance is the redesign's verdict-first page and
// the first-visit default; Dashboard is the old dense KPI set (deduplicated — index lag appears
// once) for the operator who monitors continuously. The choice persists per browser; the extra
// Dashboard queries are the cost of choosing it. The verdict block stays in both.
export function OverviewContent() {
  const [view, setView] = useState<OverviewView>('glance');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dashboard') setView('dashboard');
    } catch {
      // storage unavailable (private mode etc.) — stay on the Glance default
    }
  }, []);

  function choose(next: OverviewView) {
    setView(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // non-fatal: the choice just won't persist
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <VerdictBlock />
        <div
          role="group"
          aria-label="Overview view"
          className="flex shrink-0 self-start rounded-lg border border-card-border p-0.5"
        >
          {(['glance', 'dashboard'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => choose(v)}
              className={clsx(
                'rounded-md px-3 py-1.5 text-sm capitalize',
                view === v
                  ? 'bg-background-tertiary text-text'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'glance' ? (
        <>
          <AddressDoor />
          <StatDoors />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <LatestBlocksPanel />
            <RecentTxPanel />
          </div>
        </>
      ) : (
        <>
          <OverviewKpis />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <LivenessSegmentedPanel />
            <SupplyPanel />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <LatestBlocksPanel />
            <RecentTxPanel />
          </div>
        </>
      )}
    </div>
  );
}
