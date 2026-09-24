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
  // Operator profiles (phase 15): slot 3 publishes a feed; slot 1 is silence.
  '/operators': {
    data: [
      {
        slotId: '1', status: 'ACTIVE', operatorAddress: 'twilight1op1', moniker: null,
        verdict: null,
        feed: { publishesStatus: false, baseUrl: null, lastSuccessAt: null, ageSeconds: null, lastError: null },
      },
      {
        slotId: '3', status: 'ACTIVE', operatorAddress: 'twilight1op3', moniker: 'slot-3',
        verdict: {
          owedAll: 4, settledAll: 3, owed30: 4, settled30: 3,
          medianLatencyBlocks: '23', p90LatencyBlocks: '40',
          paid30: '30000000', paidAll: '30000000', kept30: '0', keptAll: '0',
          entitlement30: '30000000', entitlementAll: '30000000',
          recipients30: 2, denom: 'utwlt', provenance: 'chain',
        },
        feed: { publishesStatus: true, baseUrl: 'https://as.example', lastSuccessAt: new Date().toISOString(), ageSeconds: 12, lastError: null },
      },
    ],
  },
  '/operators/3/profile': {
    data: {
      identity: {
        slotId: '3', status: 'ACTIVE', operatorAddress: 'twilight1op3',
        payoutAddress: 'twilight1pay3', settlementAddress: 'twilight1settle3',
        consensusAddress: 'cafe3', consensusPower: '10', rewardWeight: '1',
        createdHeight: '1', metadata: { moniker: 'slot-3' }, provenance: 'chain',
      },
      verdict: {
        owedAll: 4, settledAll: 3, owed30: 4, settled30: 3,
        medianLatencyBlocks: '23', p90LatencyBlocks: '40',
        paid30: '30000000', paidAll: '30000000', kept30: '0', keptAll: '0',
        entitlement30: '30000000', entitlementAll: '30000000',
        recipients30: 2, denom: 'utwlt', provenance: 'chain',
      },
      recipientsTrend: [{ epochNumber: '62', recipients: 2 }],
      settlementAccountCheck: {
        settlementAddress: 'twilight1settle3', foreignTxCount: 0, foreignTxHashes: [], provenance: 'chain',
      },
      discovery: {
        payload: {
          version: 'twilight-operator-status-v1', retention_epochs: 90,
          commitments: { allocation_result_hash: true },
          draw_record: 'https://as.example/v1/selection/slots/3/epochs/{epoch}/candidates',
          rate_limit: { per_minute: 60, burst: 120 },
        },
        fetchedAt: new Date().toISOString(), ageSeconds: 30, provenance: 'attested',
      },
      rules: { distributionMethod: 'DISTRIBUTION_METHOD_UNIFORM_ACTIVE_BLOCKS', latestParams: null, provenance: 'chain' },
    },
  },
  '/operators/3/status/clock': {
    data: {
      status: 'ok', source: 'operator', provenance: 'attested',
      baseUrl: 'https://as.example', baseUrlProvenance: 'configured',
      sampledAt: new Date().toISOString(), asHeight: '100',
      fetchedAt: new Date().toISOString(), ageSeconds: 10, stale: false, staleForward: false,
      lastError: null,
      payload: {
        source: 'operator',
        current_target: { epoch: 497, state: 'OPEN', start_height: 178561, close_height: 178920 },
        enrollment: { mode: 'TRUSTED_AS_DISTRIBUTION', trusted_join_closes_at: null },
        previous_target: { epoch: 496, state: 'SETTLEMENT_RECONCILED' },
      },
    },
  },
  '/operators/1/status/clock': { data: { status: 'no_status', reason: 'this operator publishes no status' } },
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
