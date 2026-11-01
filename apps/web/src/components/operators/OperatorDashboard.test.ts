import { describe, expect, it } from 'vitest';
import { mainOption } from './OperatorDashboard';
import { metric as metricDef, type HistoryDay, type MetricDef } from '@/lib/operator-dashboard';
import type { ChartTheme } from '@/components/charts/EChart';

const theme = {
  primary: 'rgb(1 2 3)',
  primaryFaint: 'rgba(1,2,3,0.02)',
  muted: 'rgb(4 5 6)',
  grid: 'rgba(7,8,9,0.7)',
  border: 'rgb(10 11 12)',
  card: 'rgb(13 14 15)',
  text: 'rgb(16 17 18)',
} as unknown as ChartTheme;

describe('operator dashboard main chart tooltip', () => {
  it('escapes HTML in the metric label before building tooltip markup', () => {
    const metric: MetricDef = { ...metricDef('latency'), label: '<img src=x onerror=alert(1)>' };
    const days = [
      { day: '2026-10-12', firstEpoch: 1, lastEpoch: 2, minersDistinct: 3 },
    ] as unknown as HistoryDay[];
    const option = mainOption(theme, days, metric) as unknown as {
      tooltip: { formatter: (params: Array<{ dataIndex: number; value: number }>) => string };
    };
    const html = option.tooltip.formatter([{ dataIndex: 0, value: 3 }]);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
