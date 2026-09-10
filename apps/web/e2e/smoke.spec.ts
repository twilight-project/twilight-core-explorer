import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures';

// Route-render smoke + live-browser axe (incl. color-contrast, impossible under jsdom).
// Every NAV destination plus one detail page and the search flow: the page must mount, show its
// h1, throw NO uncaught page errors, and pass axe on serious/critical findings.

const ROUTES: { path: string; h1: RegExp }[] = [
  // Quiet header (14a feedback): plain h1, health lives in the status chip beside it.
  { path: '/', h1: /overview/i },
  { path: '/blocks', h1: /blocks/i },
  { path: '/blocks/42', h1: /block 42/i },
  { path: '/txs', h1: /transactions/i },
  { path: '/accounts', h1: /observed accounts|account/i },
  { path: '/validators', h1: /coreslots/i },
  { path: '/validators?tab=registry', h1: /coreslots/i },
  { path: '/validators?tab=history', h1: /coreslots/i },
  { path: '/economy', h1: /epoch .+ paid|rewards & supply/i },
  { path: '/economy?tab=entitlements', h1: /epoch .+ paid|rewards & supply/i },
  { path: '/economy?tab=settlements', h1: /epoch .+ paid|rewards & supply/i },
  { path: '/economy?tab=supply', h1: /epoch .+ paid|rewards & supply/i },
  // Old IA routes must land on the merged destinations (next.config redirects).
  { path: '/coreslots', h1: /coreslots/i },
  { path: '/rewards', h1: /epoch .+ paid|rewards & supply/i },
  { path: '/supply', h1: /epoch .+ paid|rewards & supply/i },
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

test('desktop: the header search is a real always-visible input with a "/" shortcut', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'desktop only');
  await mockApi(page);
  await page.goto('/');
  await page.getByText(/blocks behind chain tip/).waitFor();
  // Redesign: no overlay — a real input lives in the header row at all times.
  const input = page.getByRole('searchbox').first();
  await expect(input).toBeVisible();
  // The regression this guards: the old inline slot was ~50px wide — typing was invisible.
  const width = (await input.boundingBox())?.width ?? 0;
  expect(width).toBeGreaterThan(250);
  // "/" focuses it from anywhere (skipped while an editable element has focus).
  await page.keyboard.press('/');
  await expect(input).toBeFocused();
  await input.fill('2C859B3C9B9DBFCD0C484FDE34C81D0810BE75759867E98654AF2AFA2984DCCB');
  await input.press('Enter');
  await page.waitForURL(/\/search\?q=/);
});

test('mobile: the hamburger disclosure opens the compact nav', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile project only');
  await mockApi(page);
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Menu' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const nav = page.getByRole('navigation', { name: 'Primary (compact)' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: /blocks/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(nav).not.toBeVisible();
});
