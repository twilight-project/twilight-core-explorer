import { describe, expect, it } from 'vitest';
import {
  cumulativeMiners,
  historyCsv,
  lastDays,
  payoutSharePct,
  seriesFor,
  totals,
  type HistoryDay,
} from './operator-dashboard';

function day(over: Partial<HistoryDay> & { day: string }): HistoryDay {
  return {
    firstEpoch: '1',
    lastEpoch: '45',
    epochs: 45,
    settledEpochs: 45,
    entitlement: '1685569500',
    paid: '0',
    kept: '1685569500',
    payouts: 0,
    activeMiners: 0,
    newMiners: 0,
    medianLatencyBlocks: '518',
    feed: { epochs: 0, avgEnrolled: null, maxEnrolled: null, admitted: null, provenance: 'attested' },
    ...over,
  };
}

const DAYS: HistoryDay[] = [
  day({ day: '2026-10-07', paid: '973884600', kept: '711684900', activeMiners: 2, newMiners: 2 }),
  day({ day: '2026-10-08', paid: '1685569500', kept: '0', activeMiners: 1, newMiners: 0 }),
  day({
    day: '2026-10-09',
    settledEpochs: 0,
    paid: '0',
    kept: '0',
    medianLatencyBlocks: null,
    activeMiners: 3,
    newMiners: 1,
    feed: { epochs: 45, avgEnrolled: 1.4888, maxEnrolled: 3, admitted: 26, provenance: 'attested' },
  }),
];

describe('operator dashboard data', () => {
  it('converts amounts to TWLT and keeps missing values as gaps', () => {
    expect(seriesFor(DAYS, 'paid')).toEqual([
      ['2026-10-07', 973.8846],
      ['2026-10-08', 1685.5695],
      ['2026-10-09', 0],
    ]);
    expect(seriesFor(DAYS, 'latency').map(([, v]) => v)).toEqual([518, 518, null]);
    expect(seriesFor(DAYS, 'enrolled').map(([, v]) => v)).toEqual([null, null, 1.49]);
  });

  it('accumulates distinct miners from first-time miners', () => {
    expect(cumulativeMiners(DAYS)).toEqual([
      ['2026-10-07', 2],
      ['2026-10-08', 2],
      ['2026-10-09', 3],
    ]);
  });

  it('sums totals exactly in base units', () => {
    const t = totals(DAYS);
    expect(t.paid).toBeCloseTo(2659.4541, 6);
    expect(t.entitlement).toBeCloseTo(5056.7085, 6);
    expect(t.settledEpochs).toBe(90);
    expect(t.miners).toBe(3);
    expect(totals(lastDays(DAYS, 1)).paid).toBe(0);
  });

  it('payout share is paid over paid+kept, unsettled days have none', () => {
    expect(payoutSharePct(DAYS[0] as HistoryDay)).toBe(57.7);
    expect(payoutSharePct(DAYS[1] as HistoryDay)).toBe(100);
    expect(payoutSharePct(DAYS[2] as HistoryDay)).toBeNull();
  });

  it('writes a CSV with a header and one row per day', () => {
    const lines = historyCsv(DAYS).trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^day,first_epoch,last_epoch,/);
    expect(lines[3]).toContain('2026-10-09');
    expect(lines[3]).toContain(',1.4888,3,26');
  });
});
