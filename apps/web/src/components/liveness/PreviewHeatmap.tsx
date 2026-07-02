import { clsx } from 'clsx';

// PREVIEW placeholder for the per-block signing heatmap. The per-block signed/missed evidence exists
// in the `block-signatures` projection, but there's no per-slot × per-block API endpoint yet — so this
// shows the intended layout with deterministic mock cells (SSR-safe: no random) and a clear "Real data
// coming up" marker, until that endpoint is wired next iteration.
const WINDOW = 44;
const ROWS = [
  { label: 'CoreSlot A', seed: 2 },
  { label: 'CoreSlot B', seed: 5 },
  { label: 'CoreSlot C', seed: 9 },
  { label: 'CoreSlot D', seed: 12 },
];

// Deterministic miss pattern so server and client render identically (no hydration mismatch).
function isMissed(i: number, seed: number): boolean {
  return (i * 7 + seed * 5) % 19 === 0;
}

export function PreviewHeatmap() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-card-x py-card-y shadow-card">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg text-text">Signing window heatmap</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Per-CoreSlot signed / missed over the last {WINDOW} blocks
          </p>
        </div>
        <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-muted">
          preview
        </span>
      </div>
      <div className="space-y-2">
        {ROWS.map((row) => {
          const missed = Array.from({ length: WINDOW }, (_, i) => isMissed(i, row.seed)).filter(
            Boolean,
          ).length;
          return (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-text-secondary">{row.label}</span>
              <div className="flex flex-1 flex-wrap gap-[3px]">
                {Array.from({ length: WINDOW }, (_, i) => (
                  <span
                    key={i}
                    className={clsx(
                      'h-3.5 w-2.5 rounded-sm',
                      isMissed(i, row.seed) ? 'bg-accent-red' : 'bg-accent-green',
                    )}
                  />
                ))}
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-xs text-text-muted">
                {missed} / {WINDOW}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-accent-green" />
          Signed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-accent-red" />
          Missed
        </span>
        <span className="italic sm:ml-auto">
          Real data coming up — per-block signing endpoint next iteration
        </span>
      </div>
    </div>
  );
}
