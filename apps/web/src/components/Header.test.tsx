import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV, type NavGroup } from './Header';

function isMenu(e: (typeof NAV)[number]): e is Extract<(typeof NAV)[number], { children: unknown }> {
  return 'children' in e;
}

const GROUPS: NavGroup[] = ['overview', 'validators', 'economics', 'explore', 'diagnostics'];

// J-007: nav items are grouped by concern for discoverability. Every item must carry a known group,
// and groups must be contiguous (so the desktop separators land on real concern boundaries).
describe('Header nav grouping', () => {
  it('every nav item carries a known group', () => {
    for (const item of NAV) {
      expect(GROUPS).toContain(item.group);
    }
  });

  it('every nav item and dropdown child carries a wayfinding icon', () => {
    for (const item of NAV) {
      expect(item.icon, `missing icon: ${item.label}`).toBeTruthy();
      if (isMenu(item)) {
        for (const child of item.children) {
          expect(child.icon, `missing child icon: ${child.label}`).toBeTruthy();
        }
      }
    }
  });

  it('groups are contiguous (no group is split across the nav)', () => {
    const order = NAV.map((i) => i.group);
    const firstSeen = new Set<NavGroup>();
    let prev: NavGroup | null = null;
    for (const g of order) {
      if (g !== prev) {
        // entering a new run of `g` — it must not have appeared before
        expect(firstSeen.has(g)).toBe(false);
        firstSeen.add(g);
        prev = g;
      }
    }
  });

  // Regression guard (Codex 13b-ux review, reshaped for the disclosure nav): the inline desktop nav
  // appears at `xl`, so the compact nav — now a hamburger DISCLOSURE (toggle + panel), not a chip
  // wrap — must stay available until `xl`, otherwise the 1024..1279px band has no primary nav at
  // all. Class-level guard so the breakpoints can't silently regress.
  it('has no responsive nav gap: the disclosure toggle + panel stay until xl (where the desktop nav appears)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/Header.tsx'), 'utf8');
    expect(src).toContain('xl:flex'); // inline desktop nav appears at xl
    expect(src).toContain('aria-controls="compact-nav"'); // the disclosure toggle is wired
    expect(src).toContain('hover:text-text xl:hidden'); // ...and stays visible until xl
    expect(src).toContain('pb-3 xl:hidden'); // the disclosure panel also stays until xl
  });
});
