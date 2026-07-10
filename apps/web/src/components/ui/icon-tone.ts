// Shared icon-chip tint vocabulary for KpiCard/StatCard. Each key maps to a faint category surface +
// a matching icon color, resolved from the theme's --accent-* tokens (so every tint tracks the active
// theme's palette). Domain tints (infra/coreslot/liveness/risk/rewards) color by metric FAMILY so a
// metric reads the same color on every page; `warn` is the one severity tint (amber) for watch/
// degraded states, reusing the same accent-yellow the "warning" status pills use.
//
// Color = which metric family (or watch severity); the status delta pill still owns health — the two
// channels never collide. Class strings are STATIC LITERALS (not built from the key) so Tailwind's JIT
// keeps them in the build; omitting a tone falls back to the card's neutral white-alpha/muted chrome.
export type IconTone = 'infra' | 'coreslot' | 'liveness' | 'risk' | 'rewards' | 'warn';

export const ICON_TONE: Record<IconTone, string> = {
  infra: 'bg-accent-blue/10 text-accent-blue',
  coreslot: 'bg-accent-violet/10 text-accent-violet',
  liveness: 'bg-accent-green/10 text-accent-green',
  risk: 'bg-accent-red/10 text-accent-red',
  rewards: 'bg-accent-gold/10 text-accent-gold',
  warn: 'bg-accent-yellow/10 text-accent-yellow',
};
