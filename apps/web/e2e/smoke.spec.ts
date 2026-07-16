import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures';

// Route-render smoke + live-browser axe (incl. color-contrast, impossible under jsdom).
// Every NAV destination plus one detail page and the search flow: the page must mount, show its
// h1, throw NO uncaught page errors, and pass axe on serious/critical findings.

const ROUTES: { path: string; h1: RegExp }[] = [
  { path: '/', h1: /operations console/i },
  { path: '/blocks', h1: /block stream/i },
  { path: '/blocks/42', h1: /block 42/i },
  { path: '/txs', h1: /transaction stream/i },
  { path: '/accounts', h1: /observed accounts|account/i },
  { path: '/coreslots', h1: /validator set & registry/i },
  { path: '/network', h1: /validator set & network health/i },
  { path: '/liveness', h1: /liveness|signing/i },
  { path: '/rewards', h1: /rewards & emissions/i },
  { path: '/rewards/claims', h1: /claim history/i },
  { path: '/supply', h1: /token supply/i },
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
