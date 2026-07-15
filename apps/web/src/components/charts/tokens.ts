// Chart series colors resolve through the THEME TOKENS (style properties, where var() works in
// SVG) — never a hardcoded hex, so every theme (incl. daylight) recolors the charts. Each chart
// here is single-series: one hue does identity work, text stays in text tokens, grids recessive.
export type ChartTone = 'primary' | 'blue' | 'green';

export const TONE_COLOR: Record<ChartTone, string> = {
  primary: 'rgb(var(--primary))',
  blue: 'rgb(var(--accent-blue))',
  green: 'rgb(var(--accent-green))',
};

export const GRID_COLOR = 'rgb(var(--border) / 0.5)';
export const LABEL_COLOR = 'rgb(var(--text-muted))';
