// A horizontal stacked proportion bar (healthy / watch / down, supply slices, etc.). Widths are a
// pure proportion of real counts — a zero-value segment is omitted (never a sliver of fake data).
// Colors come in as token utility classes so the bar rebrands with the theme.
export interface BarSegment {
  label: string;
  value: number;
  className: string; // e.g. 'bg-accent-green'
}

export function SegmentedBar({ segments }: { segments: BarSegment[] }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  return (
    <div
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-background-tertiary"
      role="img"
      aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}
    >
      {total > 0
        ? segments.map((s) =>
            s.value > 0 ? (
              <div
                key={s.label}
                className={s.className}
                style={{ width: `${(s.value / total) * 100}%` }}
              />
            ) : null,
          )
        : null}
    </div>
  );
}
