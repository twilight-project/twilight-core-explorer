import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression guard (Copilot PR #17): page/background colors must flow through the CSS-variable theme
// tokens (e.g. bg-background / bg-page), never a hardcoded hex like bg-[#050505] that would pin the
// page to the default palette and stop the light theme from switching.
const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));

describe('theme tokens are not bypassed', () => {
  it('no component hardcodes an arbitrary background hex (theme must remain switchable)', () => {
    const offenders = files.filter((f) => /bg-\[#/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

// WCAG 1.4.3 contrast guard (audit M-008): --text-muted is used pervasively for body/secondary copy,
// so it must clear the 4.5:1 AA threshold on its own theme background (it was 107 107 122 ≈ 3.9:1).
function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function relLuminance([r = 0, g = 0, b = 0]: number[]): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrastRatio(a: number[], b: number[]): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
function tokenRgb(css: string, theme: string, name: string): number[] {
  const block = css.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([\\s\\S]*?)\\}`));
  if (!block) throw new Error(`theme block not found: ${theme}`);
  const m = (block[1] ?? '').match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
  if (!m) throw new Error(`token not found: --${name} in ${theme}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// The full theme set: one dark console and its light counterpart. Every assertion below runs
// against BOTH, so a retune cannot quietly break one ground while the other still passes.
const THEMES = ['dark', 'light'];

// Themes that repoint the display face (--font-serif) — both, since
// and both variants each pick a display sans. `legacy` inherits the Instrument Serif default, so it
// is excluded.
const BRAND_THEMES = ['dark', 'light'];

describe('theme token contrast (WCAG 1.4.3)', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

  // Text tokens are used pervasively for body/secondary copy on the page ground.
  const TEXT_TOKENS = ['text-muted', 'text-secondary'];
  // Tokens rendered AS TEXT on tinted /10 surfaces over both grounds: --primary is link text and
  // the Badge `info` tone; the three status accents back the Badge success/warning/danger tones,
  // deltas, and inline status copy. All must clear AA against --background AND --card (audit 13b
  // measured legacy --primary ≈3.3:1 and legacy --accent-red ≈4.4:1 before the retune).
  const TEXT_ON_SURFACE_TOKENS = ['primary', 'accent-green', 'accent-yellow', 'accent-red'];
  const SURFACES = ['background', 'card'];

  for (const theme of THEMES) {
    for (const token of TEXT_TOKENS) {
      it(`${theme}: --${token} on --background meets AA (>= 4.5:1)`, () => {
        const ratio = contrastRatio(tokenRgb(css, theme, token), tokenRgb(css, theme, 'background'));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const token of TEXT_ON_SURFACE_TOKENS) {
      for (const surface of SURFACES) {
        it(`${theme}: --${token} on --${surface} meets AA (>= 4.5:1)`, () => {
          const ratio = contrastRatio(tokenRgb(css, theme, token), tokenRgb(css, theme, surface));
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
        // Badges and the status banner render this token as text on ITS OWN 10% tint over the
        // surface (`bg-<token>/10 text-<token>`). The blend shifts the effective background — on
        // a light ground it lowers the ratio, and the live-browser axe run caught the light theme's
        // amber at 4.48:1 on exactly this pair. Guard the blended surface too.
        it(`${theme}: --${token} on its 10% tint over --${surface} meets AA (>= 4.5:1)`, () => {
          const fg = tokenRgb(css, theme, token);
          const bg = tokenRgb(css, theme, surface);
          const blend = fg.map((c, i) => 0.1 * c + 0.9 * (bg[i] ?? 0));
          expect(contrastRatio(fg, blend)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

// Expressive axis (shape/elevation/heading) is theme-owned. Tailwind supplies a var() fallback so a
// missing token can't break layout — but a theme that silently falls back would lose its distinct
// feel. Guard that every theme defines the expressive tokens explicitly, so differentiation is real.
describe('every theme defines the expressive shape tokens (no silent fallback)', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  for (const theme of THEMES) {
    it(`${theme}: defines --radius-2xl, --shadow-card and --display-tracking`, () => {
      const block = css.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([\\s\\S]*?)\\}`));
      expect(block, `theme block not found: ${theme}`).not.toBeNull();
      const body = block?.[1] ?? '';
      expect(body).toContain('--radius-2xl');
      expect(body).toContain('--shadow-card');
      expect(body).toContain('--display-tracking');
      // Stage-3 surface strategy: every theme picks a border-led (1px) vs elevation-led (0) treatment.
      expect(body).toContain('--card-border-width');
    });
  }
});

// Semantic-color guard (Copilot PR #68): --accent-yellow is the WARNING color — it backs the Badge/
// delta warning tone, the `warn` icon tint, and the Degraded liveness tile. A theme must not desaturate
// it to gray, or every "watch" signal vanishes in that
// theme. Assert it stays a warm amber (red channel clearly above blue) everywhere.
describe('warning color stays a real amber (not gray) in every theme', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  for (const theme of THEMES) {
    it(`${theme}: --accent-yellow is warm (R - B >= 60), not a neutral gray`, () => {
      const [r = 0, , b = 0] = tokenRgb(css, theme, 'accent-yellow');
      expect(r - b).toBeGreaterThanOrEqual(60);
    });
  }
});

// Typography: every non-default brand theme repoints the display face (--font-serif) so headings
// carry a distinct voice, not just color/shape.
describe('brand themes repoint the display face', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  for (const theme of BRAND_THEMES) {
    it(`${theme}: overrides --font-serif (display face)`, () => {
      const block = css.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([\\s\\S]*?)\\}`));
      expect(block, `theme block not found: ${theme}`).not.toBeNull();
      expect(block?.[1] ?? '').toContain('--font-serif');
    });
  }
});
