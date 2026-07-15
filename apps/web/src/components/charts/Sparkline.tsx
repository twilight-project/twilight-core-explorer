'use client';

import { TONE_COLOR, type ChartTone } from './tokens';

// Tiny inline trend (no axes — context comes from the surrounding card). Renders nothing with
// fewer than two points: a one-point "trend" would be an invented shape.
export function Sparkline({
  values,
  label,
  tone = 'primary',
  height = 28,
}: {
  values: number[];
  /** Accessible name — the sparkline is an image, not decoration. */
  label: string;
  tone?: ChartTone;
  height?: number;
}) {
  if (values.length < 2) return null;
  const w = 120;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = TONE_COLOR[tone];
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className="h-7 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <polygon
        points={`0,${height} ${pts.join(' ')} ${w},${height}`}
        style={{ fill: color, opacity: 0.12 }}
      />
      <polyline
        points={pts.join(' ')}
        style={{ fill: 'none', stroke: color, strokeWidth: 2 }}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
