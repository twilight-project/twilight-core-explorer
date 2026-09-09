import { describe, expect, it } from 'vitest';
import { blockIntervals, blockTxCounts, niceTicks, utwltToTwlt } from './shape';

describe('utwltToTwlt (BigInt split, float only at the end)', () => {
  it('converts micro-denom strings for plotting', () => {
    expect(utwltToTwlt('1000000')).toBe(1);
    expect(utwltToTwlt('1500000')).toBe(1.5);
    expect(utwltToTwlt('0')).toBe(0);
  });
  it('never guesses on missing/invalid input', () => {
    expect(utwltToTwlt(null)).toBeNull();
    expect(utwltToTwlt(undefined)).toBeNull();
    expect(utwltToTwlt('12abc')).toBeNull();
    expect(utwltToTwlt('')).toBeNull();
  });
  it('bails out (null) past float-safe whole-TWLT range instead of returning garbage', () => {
    expect(utwltToTwlt('9007199254740992000000')).toBeNull();
  });
});

describe('blockIntervals (newest-first input → chronological seconds)', () => {
  const blocks = [
    { height: '12', time: '2026-06-22T00:00:12.000Z' },
    { height: '11', time: '2026-06-22T00:00:07.000Z' },
    { height: '10', time: '2026-06-22T00:00:00.000Z' },
  ];
  it('keys each interval by the LATER height', () => {
    expect(blockIntervals(blocks)).toEqual([
      { x: '11', y: 7 },
      { x: '12', y: 5 },
    ]);
  });
  it('drops pairs with missing or unparsable times, never fabricates', () => {
    expect(blockIntervals([{ height: '2', time: null }, { height: '1', time: '2026-01-01T00:00:00Z' }])).toEqual([]);
    expect(blockIntervals([])).toEqual([]);
  });
});

describe('blockTxCounts', () => {
  it('reverses newest-first rows to chronological points', () => {
    expect(
      blockTxCounts([
        { height: '2', txCount: 3 },
        { height: '1', txCount: 0 },
      ]),
    ).toEqual([
      { x: '1', y: 0 },
      { x: '2', y: 3 },
    ]);
  });
});

describe('niceTicks (zero-baselined)', () => {
  it('starts at zero and covers the max with round steps', () => {
    const ticks = niceTicks(7.3);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(7.3);
  });
  it('degrades to [0] on empty/invalid ranges', () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(Number.NaN)).toEqual([0]);
  });
});
