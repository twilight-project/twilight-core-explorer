import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHAIN_SUBNAV,
  NODE_SUBNAV,
  isSubnavActive,
  type SubnavEntry,
} from './Header';

// Control-room chrome contract: TWO modes with fixed sub-navs, longest-prefix-wins active
// detection, and the load-bearing chrome strings the e2e tier greps for.

describe('mode sub-navs', () => {
  it('My node: Overview · Rewards · Settlements, under /node', () => {
    expect(NODE_SUBNAV.map((e) => e.label)).toEqual(['Overview', 'Rewards', 'Settlements']);
    for (const e of NODE_SUBNAV) expect(e.href.startsWith('/node')).toBe(true);
  });

  it('Chain: Blocks · Transactions · Slots · Economy', () => {
    expect(CHAIN_SUBNAV.map((e) => e.label)).toEqual([
      'Blocks',
      'Transactions',
      'Slots',
      'Economy',
    ]);
  });
});

describe('isSubnavActive', () => {
  const at = (pathname: string, nav: SubnavEntry[]) =>
    nav.filter((e) => isSubnavActive(pathname, e, nav)).map((e) => e.label);

  it('longest prefix wins inside /node', () => {
    expect(at('/node', NODE_SUBNAV)).toEqual(['Overview']);
    expect(at('/node/rewards', NODE_SUBNAV)).toEqual(['Rewards']);
    expect(at('/node/settlements', NODE_SUBNAV)).toEqual(['Settlements']);
  });

  it('chain detail routes light their destination', () => {
    expect(at('/blocks/42', CHAIN_SUBNAV)).toEqual(['Blocks']);
    expect(at('/chain', CHAIN_SUBNAV)).toEqual(['Blocks']);
    expect(at('/txs/ABCDEF', CHAIN_SUBNAV)).toEqual(['Transactions']);
    expect(at('/coreslots/3', CHAIN_SUBNAV)).toEqual(['Slots']);
    expect(at('/operator/twilight1x', CHAIN_SUBNAV)).toEqual(['Slots']);
    expect(at('/operators/3', CHAIN_SUBNAV)).toEqual(['Slots']);
    expect(at('/rewards/epochs/9', CHAIN_SUBNAV)).toEqual(['Economy']);
    expect(at('/mining/settlements/1/62', CHAIN_SUBNAV)).toEqual(['Economy']);
    expect(at('/accounts/twilight1x', CHAIN_SUBNAV)).toEqual(['Economy']);
  });

  it('no cross-mode or cross-entry leaks', () => {
    expect(at('/node', CHAIN_SUBNAV)).toEqual([]);
    expect(at('/diagnostics', CHAIN_SUBNAV)).toEqual([]);
    expect(at('/blocks', NODE_SUBNAV)).toEqual([]);
  });
});

// Source-guard for chrome behaviors that only manifest in a browser: the mode switch persists
// (localStorage 'tw-mode'), honors ?mode=, and the ⌘K search parses `slot N`.
describe('chrome source guards', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('mode persistence + query override are wired', () => {
    const src = read('src/components/Header.tsx');
    expect(src).toContain("localStorage.setItem('tw-mode'");
    expect(src).toContain("searchParams.get('mode')");
    expect(src).toContain('getLinkedSlot');
  });

  it('the command search has the ⌘K binding and the slot shortcut', () => {
    const src = read('src/components/CommandSearch.tsx');
    expect(src).toContain("e.metaKey || e.ctrlKey");
    expect(src).toContain('/^slot\\s+(\\d+)$/i');
    expect(src).toContain('/search?q=');
  });

  it('the status strip is mounted above the header in the layout', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout.indexOf('<StatusStrip />')).toBeGreaterThan(-1);
    expect(layout.indexOf('<StatusStrip />')).toBeLessThan(layout.indexOf('<Header />'));
  });
});
