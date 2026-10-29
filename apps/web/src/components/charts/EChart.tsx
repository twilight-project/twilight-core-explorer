'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

// Thin Apache ECharts host for the dashboard charts (the library DefiLlama's charts are built
// on). Only the pieces the dashboards use are registered, so the bundle stays small. ECharts
// draws on canvas, where CSS var() does not resolve — so the theme tokens are read from the
// document at render time and the chart re-renders when the theme toggle flips data-theme.

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export interface ChartTheme {
  primary: string;
  primarySoft: string;
  primaryFaint: string;
  copper: string;
  /** The secondary accent at low alpha — the far end of area fills (indigo → rose, like the art). */
  copperFaint: string;
  text: string;
  textSecondary: string;
  muted: string;
  grid: string;
  card: string;
  border: string;
}

const FALLBACK: ChartTheme = {
  primary: 'rgb(67 61 176)',
  primarySoft: 'rgba(67,61,176,0.35)',
  primaryFaint: 'rgba(67,61,176,0.02)',
  copper: 'rgb(182 76 138)',
  copperFaint: 'rgba(182,76,138,0.06)',
  text: 'rgb(17 17 17)',
  textSecondary: 'rgb(58 61 70)',
  muted: 'rgb(90 93 102)',
  grid: 'rgba(196,199,212,0.7)',
  card: 'rgb(243 244 249)',
  border: 'rgb(196 199 212)',
};

function readTheme(): ChartTheme {
  if (typeof window === 'undefined') return FALLBACK;
  const css = getComputedStyle(document.documentElement);
  const tok = (name: string) => css.getPropertyValue(name).trim().replace(/\s+/g, ',');
  const rgb = (name: string, alpha?: number) => {
    const v = tok(name);
    if (!v) return null;
    return alpha === undefined ? `rgb(${v})` : `rgba(${v},${alpha})`;
  };
  return {
    primary: rgb('--primary') ?? FALLBACK.primary,
    primarySoft: rgb('--primary', 0.35) ?? FALLBACK.primarySoft,
    primaryFaint: rgb('--primary', 0.02) ?? FALLBACK.primaryFaint,
    copper: rgb('--accent-blue') ?? FALLBACK.copper,
    copperFaint: rgb('--accent-blue', 0.06) ?? FALLBACK.copperFaint,
    text: rgb('--text') ?? FALLBACK.text,
    textSecondary: rgb('--text-secondary') ?? FALLBACK.textSecondary,
    muted: rgb('--text-muted') ?? FALLBACK.muted,
    grid: rgb('--border', 0.7) ?? FALLBACK.grid,
    card: rgb('--card') ?? FALLBACK.card,
    border: rgb('--card-border') ?? FALLBACK.border,
  };
}

/** The current chart theme; updates when the document's data-theme attribute changes. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);
  useEffect(() => {
    setTheme(readTheme());
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

/** Shared tooltip chrome: the card surface, hairline border, text tokens. */
export function tooltipBase(t: ChartTheme) {
  return {
    backgroundColor: t.card,
    borderColor: t.border,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: t.text, fontSize: 12, fontFamily: 'var(--font-mono), monospace' },
    extraCssText: 'border-radius:4px;box-shadow:none;',
  };
}

export function EChart({
  option,
  height,
  label,
  onReady,
}: {
  option: EChartsCoreOption;
  height: number;
  /** Accessible name for the chart image. */
  label: string;
  onReady?: (chart: echarts.ECharts) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    onReady?.(chart);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // onReady is a mount-time hook; re-running it on every render would re-create the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={label} style={{ width: '100%', height }} />;
}
