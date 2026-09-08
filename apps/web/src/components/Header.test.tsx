import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPLORER_LINKS, NAV, isActive, type NavGroup } from './Header';

const GROUPS: NavGroup[] = ['overview', 'validators', 'economics', 'explore'];

// Redesign IA: exactly four destinations, each with a wayfinding icon. Diagnostics and the API
// live in the footer, and the Explorer dropdown is gone (its streams are EXPLORER_LINKS).
describe('Header nav (4-destination redesign)', () => {
  it('has exactly the four destinations, in order', () => {
    expect(NAV.map((i) => i.label)).toEqual(['Overview', 'Validators', 'Economy', 'Explorer']);
  });

  it('every nav item carries a known group and an icon', () => {
    for (const item of NAV) {
      expect(GROUPS).toContain(item.group);
      expect(item.icon, `missing icon: ${item.label}`).toBeTruthy();
    }
    for (const child of EXPLORER_LINKS) {
      expect(child.icon, `missing child icon: ${child.label}`).toBeTruthy();
    }
  });

  it('keeps merged/child routes active under their destination', () => {
    const byLabel = Object.fromEntries(NAV.map((i) => [i.label, i]));
    // Validators owns the coreslot detail + operator routes (their pages are unchanged).
    expect(isActive('/coreslots/3', byLabel['Validators']!)).toBe(true);
    expect(isActive('/operator/twilight1abc', byLabel['Validators']!)).toBe(true);
    // Economy owns the surviving reward/mining detail routes.
    expect(isActive('/rewards/epochs/9', byLabel['Economy']!)).toBe(true);
    expect(isActive('/mining/settlements/1/62', byLabel['Economy']!)).toBe(true);
    // Explorer spans its three streams.
    expect(isActive('/txs', byLabel['Explorer']!)).toBe(true);
    expect(isActive('/accounts', byLabel['Explorer']!)).toBe(true);
    expect(isActive('/blocks/42', byLabel['Explorer']!)).toBe(true);
    // ...without leaking active state across destinations.
    expect(isActive('/economy', byLabel['Validators']!)).toBe(false);
    expect(isActive('/', byLabel['Explorer']!)).toBe(false);
  });

  // Regression guard (Codex 13b-ux review, reshaped for the disclosure nav): the inline desktop nav
  // appears at `xl`, so the compact nav — a hamburger DISCLOSURE (toggle + panel) — must stay
  // available until `xl`, otherwise the 1024..1279px band has no primary nav at all. And the
  // redesign's always-visible search must exist at `lg`+ (no icon-only overlay).
  it('has no responsive nav gap and keeps the desktop search visible', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/Header.tsx'), 'utf8');
    expect(src).toContain('xl:flex'); // inline desktop nav appears at xl
    expect(src).toContain('aria-controls="compact-nav"'); // the disclosure toggle is wired
    expect(src).toContain('hover:text-text xl:hidden'); // ...and stays visible until xl
    expect(src).toContain('pb-3 xl:hidden'); // the disclosure panel also stays until xl
    expect(src).toContain('lg:block'); // the always-visible desktop search at lg+
    expect(src).not.toContain('SearchBar overlay'); // the icon-overlay search pattern is gone
  });
});
