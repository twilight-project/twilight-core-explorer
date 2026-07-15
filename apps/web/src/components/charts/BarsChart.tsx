'use client';

import { useState } from 'react';
import { niceTicks } from './shape';
import { GRID_COLOR, LABEL_COLOR, TONE_COLOR, type ChartTone } from './tokens';

export type Bar = { label: string; value: number; hint?: string };

// Single-series, zero-baselined vertical bars: thin marks with a 2px surface gap between
// neighbors and rounded data-ends (the top corners), per-bar hover tooltip. Identity lives on
// the x-axis (labels/tooltip), not in color — one hue via theme tokens.
const PAD = { top: 8, right: 8, bottom: 20, left: 44 };

export function BarsChart({
  bars,
  label,
  tone = 'primary',
  height = 180,
  formatY = (v: number) => String(v),
}: {
  bars: Bar[];
  /** Accessible name for the chart image. */
  label: string;
  tone?: ChartTone;
  height?: number;
  formatY?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 640;
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  if (bars.length === 0) return null;
  const maxY = Math.max(...bars.map((b) => b.value));
  const ticks = niceTicks(maxY);
  const top = ticks[ticks.length - 1] ?? 1;
  const band = innerW / bars.length;
  const gap = Math.min(2, band * 0.2); // 2px surface gap between fills
  const barW = Math.max(1, band - gap);
  const py = (v: number) => PAD.top + innerH - (v / (top || 1)) * innerH;
  const color = TONE_COLOR[tone];
  const hovered = hover !== null ? bars[hover] : undefined;
  const r = Math.min(3, barW / 2); // rounded data-end, anchored to the baseline

  const first = bars[0];
  const last = bars[bars.length - 1];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={py(t)}
              y2={py(t)}
              style={{ stroke: GRID_COLOR, strokeWidth: 1 }}
            />
            <text
              x={PAD.left - 6}
              y={py(t) + 3}
              textAnchor="end"
              style={{ fill: LABEL_COLOR, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            >
              {formatY(t)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = PAD.left + i * band + gap / 2;
          const y = py(b.value);
          const h = PAD.top + innerH - y;
          // Rounded top corners only — the baseline end stays square (anchored, honest zero).
          const d =
            h <= r
              ? `M${x},${PAD.top + innerH} h${barW} v${-h} h${-barW} Z`
              : `M${x},${PAD.top + innerH} v${-(h - r)} q0,-${r} ${r},-${r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} Z`;
          return (
            <path
              key={b.label}
              d={d}
              style={{ fill: color, opacity: hover === null || hover === i ? 1 : 0.45 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {first && last ? (
          <>
            <text
              x={PAD.left}
              y={height - 6}
              style={{ fill: LABEL_COLOR, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            >
              {first.label}
            </text>
            {bars.length > 1 ? (
              <text
                x={w - PAD.right}
                y={height - 6}
                textAnchor="end"
                style={{ fill: LABEL_COLOR, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              >
                {last.label}
              </text>
            ) : null}
          </>
        ) : null}
      </svg>
      {hovered && hover !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1 rounded-lg border border-card-border bg-card px-2 py-1 text-xs text-text shadow-card"
          style={{
            left: `min(max(${(((PAD.left + hover * band) / w) * 100).toFixed(1)}% - 40px, 0%), calc(100% - 130px))`,
          }}
        >
          {hovered.hint ?? `${hovered.label} — ${formatY(hovered.value)}`}
        </div>
      ) : null}
    </div>
  );
}
