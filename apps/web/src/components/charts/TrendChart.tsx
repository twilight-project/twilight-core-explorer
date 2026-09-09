'use client';

import { useState } from 'react';
import { niceTicks, type ChartPoint } from './shape';
import { GRID_COLOR, LABEL_COLOR, TONE_COLOR, type ChartTone } from './tokens';

// Single-series, zero-baselined trend (line or area) with a crosshair + tooltip hover layer.
// One y-axis by design (two measures = two charts, never a dual axis). Colors/labels/grid all
// resolve through theme tokens; identity lives in the panel title, so there is no legend box.
const PAD = { top: 8, right: 8, bottom: 20, left: 44 };

export function TrendChart({
  points,
  label,
  tone = 'primary',
  area = false,
  height = 180,
  formatY = (v: number) => String(v),
  formatX = (x: string) => x,
  tooltip,
}: {
  points: ChartPoint[];
  /** Accessible name for the chart image. */
  label: string;
  tone?: ChartTone;
  area?: boolean;
  height?: number;
  formatY?: (v: number) => string;
  formatX?: (x: string) => string;
  /** Tooltip line for a hovered point; defaults to "formatX — formatY". */
  tooltip?: (p: ChartPoint) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 640;
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  if (points.length < 2) return null;
  const maxY = Math.max(...points.map((p) => p.y));
  const ticks = niceTicks(maxY);
  const top = ticks[ticks.length - 1] ?? 1;
  const px = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const py = (v: number) => PAD.top + innerH - (v / (top || 1)) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
  const color = TONE_COLOR[tone];
  const first = points[0];
  const last = points[points.length - 1];
  const hovered = hover !== null ? points[hover] : undefined;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // The svg scales to its container — map back into viewBox coordinates first.
    const x = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.round(((x - PAD.left) / innerW) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="w-full"
        role="img"
        aria-label={label}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
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
        {area ? (
          <path
            d={`${path} L${px(points.length - 1).toFixed(1)},${py(0)} L${px(0).toFixed(1)},${py(0)} Z`}
            style={{ fill: color, opacity: 0.12 }}
          />
        ) : null}
        <path
          d={path}
          style={{ fill: 'none', stroke: color, strokeWidth: 2 }}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {first && last ? (
          <>
            <text
              x={PAD.left}
              y={height - 6}
              style={{ fill: LABEL_COLOR, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            >
              {formatX(first.x)}
            </text>
            <text
              x={w - PAD.right}
              y={height - 6}
              textAnchor="end"
              style={{ fill: LABEL_COLOR, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            >
              {formatX(last.x)}
            </text>
          </>
        ) : null}
        {hovered && hover !== null ? (
          <g aria-hidden="true">
            <line
              x1={px(hover)}
              x2={px(hover)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              style={{ stroke: GRID_COLOR, strokeWidth: 1 }}
            />
            {/* Marker with a 2px surface ring so it separates from the line underneath. */}
            <circle
              cx={px(hover)}
              cy={py(hovered.y)}
              r={4}
              style={{ fill: color, stroke: 'rgb(var(--card))', strokeWidth: 2 }}
            />
          </g>
        ) : null}
      </svg>
      {hovered ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1 rounded-lg border border-card-border bg-card px-2 py-1 text-xs text-text shadow-card"
          style={{
            left: `min(max(${((px(hover ?? 0) / w) * 100).toFixed(1)}% - 60px, 0%), calc(100% - 130px))`,
          }}
        >
          {tooltip ? tooltip(hovered) : `${formatX(hovered.x)} — ${formatY(hovered.y)}`}
        </div>
      ) : null}
    </div>
  );
}
