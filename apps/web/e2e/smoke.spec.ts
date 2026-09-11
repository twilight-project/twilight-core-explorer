import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures';

// Route-render smoke + live-browser axe (incl. color-contrast, impossible under jsdom).
// Every NAV destination plus one detail page and the search flow: the page must mount, show its
// h1, throw NO uncaught page errors, and pass axe on serious/critical findings.

const ROUTES: { path: string; h1: RegExp }[] = [
  // `/` routes per mode (Chain without a linked slot); the chain verdict states the answer.
  { path: '/', h1: /network is healthy|blocks behind|coreslots down|chain/i },
  { path: '/chain', h1: /network is healthy|blocks behind|coreslots down|chain/i },
  // /node without a linked slot: the centered link prompt.
  { path: '/node', h1: /my node/i },
  { path: '/blocks', h1: /blocks/i },
  { path: '/blocks/42', h1: /block 42/i },
  { path: '/txs', h1: /transactions/i },
  { path: '/accounts', h1: /observed accounts|account/i },
  { path: '/slots', h1: /slots/i },
  { path: '/slots?tab=registry', h1: /slots/i },
  { path: '/slots?tab=operators', h1: /slots/i },
  // The operator profile ("mine with us" deep link) + the /operators index redirect.
  { path: '/operators/3', h1: /slot-3|coreslot 3 operator/i },
  { path: '/operators', h1: /slots/i },
  { path: '/slots?tab=history', h1: /slots/i },
  { path: '/economy', h1: /economy/i },
  { path: '/economy?tab=entitlements', h1: /economy/i },
  { path: '/economy?tab=settlements', h1: /economy/i },
  { path: '/economy?tab=supply', h1: /economy/i },
  // Old IA routes must land on the merged destinations (next.config redirects).
  { path: '/coreslots', h1: /slots/i },
  { path: '/rewards', h1: /economy/i },
  { path: '/supply', h1: /economy/i },
  { path: '/mining/settlements/1/62', h1: /settlement/i },
  { path: '/diagnostics', h1: /diagnostics/i },
  { path: '/search?q=999999', h1: /search/i },
];

for (const { path, h1 } of ROUTES) {
  test(`renders ${path} with no page errors and passes axe`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));
    await mockApi(page);

    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(h1);
    // The mid-backfill fixture must surface the global lag banner on every page.
    await expect(page.getByText(/blocks behind chain tip/)).toBeVisible();

    // Freeze transitions before sampling colors: hydration flips the theme toggle's active chip,
    // and axe sampling MID color-transition sees an interpolated (transiently sub-AA) color.
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    const axe = await new AxeBuilder({ page }).analyze();
    const serious = axe.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`),
      'axe serious/critical violations',
    ).toEqual([]);
    expect(pageErrors.map(String)).toEqual([]);
  });
}

test('desktop: the ⌘K command search focuses, resolves `slot N`, and submits to /search', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'desktop only');
  await mockApi(page);
  await page.goto('/');
  await page.getByText(/blocks behind chain tip/).waitFor();
  const input = page.getByRole('searchbox').first();
  await expect(input).toBeVisible();
  // The regression this guards: the old inline slot was ~50px wide — typing was invisible.
  const width = (await input.boundingBox())?.width ?? 0;
  expect(width).toBeGreaterThan(150);
  // ⌘K / Ctrl+K focuses from anywhere.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(input).toBeFocused();
  // `slot N` short-circuits straight to the slot page.
  await input.fill('slot 3');
  await input.press('Enter');
  await page.waitForURL(/\/coreslots\/3/);
  // Anything else goes to /search.
  await input.fill('2C859B3C9B9DBFCD0C484FDE34C81D0810BE75759867E98654AF2AFA2984DCCB');
  await input.press('Enter');
  await page.waitForURL(/\/search\?q=/);
});

test('chrome: status strip + mode switch are present on every viewport', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  // Status strip: chain id in mint, indexed-ago on the right.
  await expect(page.getByText('twilight-devnet-1').first()).toBeVisible();
  await expect(page.getByText(/indexed .*ago|indexed …/).first()).toBeVisible();
  // Mode switch: both segments, Chain default without a linked slot.
  const modeGroup = page.getByRole('group', { name: 'Mode' });
  await expect(modeGroup.getByRole('link', { name: 'My node' })).toBeVisible();
  await expect(modeGroup.getByRole('link', { name: 'Chain' })).toBeVisible();
  // Chain sub-nav renders its four destinations.
  const nav = page.getByRole('navigation', { name: 'Primary' });
  for (const label of ['Blocks', 'Transactions', 'Slots', 'Economy']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
});

test('my node: linking a slot opens the dashboard and the strip shows it', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'desktop only');
  await mockApi(page);
  await page.goto('/node');
  await expect(page.getByText(/enter your operator address or slot/i)).toBeVisible();
  const input = page.getByLabel('Operator address or slot id');
  await input.fill('slot 2');
  await page.getByRole('button', { name: 'Open' }).click();
  // The dashboard mounts for the linked slot (fixtures return an honest not-found detail,
  // so the error state naming the CoreSlot is the success criterion for the gate itself).
  await expect(page.getByText(/coreslot/i).first()).toBeVisible();
  // And the link persists.
  await page.goto('/node');
  await expect(page.getByText(/enter your operator address or slot/i)).not.toBeVisible();
});
