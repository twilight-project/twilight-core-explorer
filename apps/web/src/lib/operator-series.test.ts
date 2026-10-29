import { describe, expect, it } from 'vitest';
import { buildEpochSeries } from './operator-series';

const status = (epoch: string, over: Partial<{ entitlementAmount: string; settled: boolean; latencyBlocks: string | null }> = {}) => ({
  epochNumber: epoch,
  entitlementAmount: '37457100',
  settled: true,
  latencyBlocks: '514',
  ...over,
});

describe('buildEpochSeries', () => {
  it('joins activity by epoch, oldest first, with paid% and latency', () => {
    const rows = buildEpochSeries(
      [status('1657', { latencyBlocks: '520' }), status('1656')],
      [
        { epochNumber: '1657', totalPaid: '37457100', releasedRemainder: '0', payoutCount: 1 },
        { epochNumber: '1656', totalPaid: '0', releasedRemainder: '37457100', payoutCount: 0 },
      ],
    );
    expect(rows.map((r) => r.epoch)).toEqual(['1656', '1657']); // reversed to oldest-first
    expect(rows[1]).toMatchObject({ epoch: '1657', recipients: 1, paidPct: 100, latency: 520 });
    expect(rows[1]?.paidTwlt).toBeCloseTo(37.4571);
    expect(rows[0]).toMatchObject({ recipients: 0, paidPct: 0 });
    expect(rows[0]?.keptTwlt).toBeCloseTo(37.4571);
  });

  it('unsettled epoch: null paid% and latency, zero recipients', () => {
    const [row] = buildEpochSeries([status('1658', { settled: false, latencyBlocks: null })], []);
    expect(row).toMatchObject({ settled: false, paidPct: null, latency: null, recipients: 0 });
  });

  it('settled epoch with no activity row still reads as 0% paid', () => {
    const [row] = buildEpochSeries([status('50')], []);
    expect(row?.paidPct).toBe(0);
    expect(row?.paidTwlt).toBe(0);
  });

  it('caps at max and keeps the NEWEST rows (input is newest-first)', () => {
    const rows = buildEpochSeries(
      [status('5'), status('4'), status('3'), status('2'), status('1')],
      [],
      3,
    );
    expect(rows.map((r) => r.epoch)).toEqual(['3', '4', '5']);
  });
});
