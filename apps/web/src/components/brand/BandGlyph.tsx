import { useId } from 'react';

// twilight.org's motif in miniature: a row of vertical gradient bands (the hero and section art),
// used wherever the explorer used to show a generic line icon. The top of each band takes
// currentColor — so the caller's tone class picks the metric family's accent — and fades into the
// theme's wash (--accent-burgundy: pale rose on light, plum on midnight), like the site's art.
// Each `seed` (the icon's or label's name) maps to a fixed band profile, so neighbouring cards
// read as different silhouettes while staying in one family. The bands rise in on mount and then
// breathe slowly (globals.css `.tw-band`); prefers-reduced-motion stills them.

const PROFILES: number[][] = [
  [0.45, 0.75, 1, 0.75, 0.45], // peak — the hero art
  [0.35, 0.55, 0.7, 0.85, 1], // rise
  [1, 0.7, 0.45, 0.7, 1], // valley
  [0.6, 1, 0.6, 0.85, 0.5], // pulse
  [0.8, 0.8, 0.8, 0.8, 0.8], // steady
  [1, 0.85, 0.7, 0.55, 0.4], // fall
  [0.5, 0.9, 0.65, 1, 0.75], // ridge
  [0.4, 0.6, 1, 1, 0.6], // shoulder
];

function profileFor(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PROFILES[h % PROFILES.length] as number[];
}

export function BandGlyph({
  seed,
  size,
  className,
}: {
  /** Stable name (icon or label) that fixes the band profile. */
  seed: string;
  size: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const bands = profileFor(seed);
  const gap = 1.5;
  const w = (24 - gap * (bands.length - 1)) / bands.length;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
    >
      <defs>
        <linearGradient id={`tw-band-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="1" style={{ stopColor: 'rgb(var(--accent-burgundy))' }} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {bands.map((hgt, i) => {
        const bh = 24 * hgt;
        return (
          <rect
            key={i}
            className="tw-band"
            x={i * (w + gap)}
            y={24 - bh}
            width={w}
            height={bh}
            fill={`url(#tw-band-${id})`}
            style={{ ['--i' as string]: i }}
          />
        );
      })}
    </svg>
  );
}
