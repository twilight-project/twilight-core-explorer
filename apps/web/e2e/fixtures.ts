import type { Page } from '@playwright/test';

// Minimal API fixtures for the smoke tier: enough shape for every page to reach its real success
// or empty state (never a fabricated dataset — lists are empty, objects carry honest values).
// The browser fetches NEXT_PUBLIC_API_BASE_URL (http://localhost:8080 in the default build), so
// interception matches any host's /api/v1/* path.

const EMPTY_LIST = { data: [], page: { limit: 25, nextCursor: null } };

const STATUS = {
  data: {
    chainId: 'twilight-devnet-1',
    build: { version: 'e2e', gitSha: null, builtAt: null, environment: 'test' },
    indexer: {
      lastIndexedHeight: '369',
      latestChainHeight: '200666',
      lagBlocks: '200297',
      status: 'indexing',
      lastIndexedHash: 'AB'.repeat(32),
      updatedAt: '2026-07-15T00:00:00.000Z',
      freshnessSeconds: 2,
      error: null,
    },
    projections: [],
    projectionFailures: { unresolvedCount: 0, byProjection: [] },
  },
};

// Object-shaped (non-list) endpoints, matched by pathname suffix after /api/v1.
const OBJECT_FIXTURES: Record<string, unknown> = {
  '/status': STATUS,
  '/projections': { data: [] },
  '/decode-failures': { data: [] },
  '/network/validator-set': null, // 404 — validator set needs an indexed height
  '/network/proposers': { data: [] },
  '/network/liveness-risk': null, // 404 — no snapshot yet
  '/network/signing-heatmap': null,
  '/blocks/aggregate': null,
  '/txs/aggregate': null,
  '/accounts/aggregate': null,
  '/supply': null,
  '/search': { data: [] },
  // Status view: shape includes the per-slot latency summaries alongside the page.
  '/mining/settlements/status': { data: [], slots: [], page: { limit: 25, nextCursor: null } },
  // Settlement detail is object-shaped; the smoke tier only needs it to render, so give it a
  // minimal settled settlement with one recipient.
  '/mining/settlements/1/62': {
    data: {
      slotId: '1', epochNumber: '62', settled: true,
      finalizationReason: 'SETTLEMENT_FINALIZATION_REASON_AUTHORIZED_EARLY',
      releasedRemainder: '0', finalizedHeight: '22623', finalizeTxHash: 'ABCDEF',
      chunkCount: 1, payoutCount: 1, totalPaid: '10000000', denom: 'utwlt',
      lastHeight: '22623',
      entitlementAmount: '10000000', epochCloseHeight: '22600', latencyBlocks: '23',
      chunks: [{ chunkIndex: '0', recipientCount: 1, chunkTotal: '10000000', height: '22608', txHash: 'ABCDEF' }],
      payouts: [{
        id: '1', slotId: '1', epochNumber: '62', chunkIndex: '0', payoutIndex: 0,
        recipient: 'twilight1recipient', amount: '10000000', denom: 'utwlt',
        height: '22608', txHash: 'ABCDEF', msgIndex: 0,
      }],
    },
  },
};

export async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    if (path in OBJECT_FIXTURES) {
      const body = OBJECT_FIXTURES[path];
      if (body === null) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'not_found', message: 'no data yet (e2e)' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      return;
    }
    // Single-resource detail paths (e.g. /blocks/123) → honest not_found; list paths → empty page.
    const isList = !/\/(blocks|txs|accounts|coreslots|rewards\/epochs|operator)\/[^/]+$/.test(path);
    if (isList) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_LIST),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'not found (e2e)' } }),
    });
  });
}
