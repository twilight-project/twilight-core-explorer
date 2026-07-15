// Pure data shaping for the chart layer — everything here is unit-testable in jsdom.
// Heights/amounts arrive as decimal STRINGS (int64-scale); conversion to plottable numbers
// happens here, explicitly, and never fabricates values (missing/invalid → dropped or null).

export type ChartPoint = { x: string; y: number };

/** utwlt string → TWLT number for PLOTTING ONLY (display always goes through lib/format). */
export function utwltToTwlt(raw: string | null | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  // Split with BigInt so the whole part is exact; float only enters at the end.
  const v = BigInt(raw);
  const whole = v / 1_000_000n;
  const frac = v % 1_000_000n;
  if (whole > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(whole) + Number(frac) / 1e6;
}

/** Newest-first block rows → chronological inter-block seconds, keyed by the LATER height. */
export function blockIntervals(
  blocks: { height: string; time: string | null }[],
): ChartPoint[] {
  const chrono = [...blocks].reverse();
  const out: ChartPoint[] = [];
  for (let i = 1; i < chrono.length; i++) {
    const prev = chrono[i - 1];
    const cur = chrono[i];
    if (!prev?.time || !cur?.time) continue;
    const a = Date.parse(prev.time);
    const b = Date.parse(cur.time);
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) continue;
    out.push({ x: cur.height, y: (b - a) / 1000 });
  }
  return out;
}

/** Newest-first block rows → chronological tx counts. */
export function blockTxCounts(blocks: { height: string; txCount: number }[]): ChartPoint[] {
  return [...blocks].reverse().map((b) => ({ x: b.height, y: b.txCount }));
}

/** A few round ticks spanning [0, max] — charts here are zero-baselined by design. */
export function niceTicks(max: number, count = 3): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const rawStep = max / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  // The top tick must COVER max (the scale is sized by the last tick).
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step * 0.001; t += step) ticks.push(Number(t.toFixed(6)));
  return ticks;
}
