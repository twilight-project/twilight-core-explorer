import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildServer } from '../dist/server.js';
import { verifyFeedEpoch } from '../dist/routes/operators.js';
import {
  MockPrisma,
  testConfig,
  block,
  coreSlot,
  entitlement,
  epoch,
  payout,
  settlementFinalization,
  tx,
} from './mock-prisma.js';

const build = (data) => buildServer({ config: testConfig, prisma: new MockPrisma(data) });

const ADDR = 'twilight1mw4n9ksh7ank3ewqu4vpg7f82ccp83xw03xmgl';

const clockSample = (slotId, over = {}) => ({
  sampleKey: `${slotId}:clock:-`,
  slotId: BigInt(slotId),
  kind: 'clock',
  epochNumber: null,
  baseUrl: 'https://as.example',
  payloadJson: { source: 'operator', current_target: { epoch: 497, state: 'OPEN' } },
  sampledAt: new Date(),
  asHeight: 100n,
  fetchedAt: new Date(),
  lastAttemptAt: new Date(),
  lastHttpStatus: 200,
  lastError: null,
  ...over,
});

const epochSample = (slotId, epochNumber, payload) => ({
  sampleKey: `${slotId}:epoch:${epochNumber}`,
  slotId: BigInt(slotId),
  kind: 'epoch',
  epochNumber: BigInt(epochNumber),
  baseUrl: 'https://as.example',
  payloadJson: payload,
  sampledAt: new Date(),
  asHeight: 100n,
  fetchedAt: new Date(),
  lastAttemptAt: new Date(),
  lastHttpStatus: 200,
  lastError: null,
});

// A settled feed epoch whose four §6.5 checks all hold against 2 chain payouts of 100 each.
const GOOD_EPOCH = {
  state: 'SETTLEMENT_RECONCILED',
  counts: {
    enrolled: 3,
    eligible: 3,
    admitted: 2,
    not_eligible: { NO_VERIFIED_ACTIVITY: 0 },
    excluded: { EXCLUDED_BELOW_FLOOR: 1 },
  },
  share: { amount: '100', denom: 'utwlt' },
};

describe('operators directory + profile', () => {
  it('lists slots with chain verdict figures and feed health', async () => {
    const app = await build({
      coreSlots: [coreSlot(3, { metadataJson: { moniker: 'slot-3' } })],
      epochs: [epoch(61), epoch(62)],
      entitlements: [entitlement(1, 3, 61), entitlement(2, 3, 62)],
      finalizations: [settlementFinalization(3, 61, 623)],
      payouts: [payout(1, ADDR, 620, { slotId: 3n, epochNumber: 61n, amount: '100' })],
      operatorStatusSamples: [clockSample(3)],
    });
    const res = await app.inject({ url: '/api/v1/operators' });
    assert.equal(res.statusCode, 200);
    const row = res.json().data.find((r) => r.slotId === '3');
    assert.equal(row.moniker, 'slot-3');
    assert.equal(row.verdict.owedAll, 2);
    assert.equal(row.verdict.settledAll, 1);
    assert.equal(row.verdict.paidAll, '100');
    assert.equal(row.verdict.provenance, 'chain');
    assert.equal(row.feed.publishesStatus, true);
    assert.equal(typeof row.feed.ageSeconds, 'number');
    await app.close();
  });

  it('profile returns identity + verdict + settlement-account check; 404 unknown slot', async () => {
    const app = await build({
      coreSlots: [coreSlot(3, { settlementAddress: ADDR })],
      epochs: [epoch(61)],
      entitlements: [entitlement(1, 3, 61)],
      txs: [
        tx('SETTLE1', 10, 0, { signerAddressesJson: [ADDR], messageTypesJson: ['/twilight.mining.v1.MsgSubmitSettlementChunk'] }),
        tx('FOREIGN1', 11, 0, { signerAddressesJson: [ADDR], messageTypesJson: ['/cosmos.bank.v1beta1.MsgSend'] }),
      ],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/profile' });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.identity.slotId, '3');
    assert.equal(d.identity.provenance, 'chain');
    // ADR-MINIS-0010 check: exactly the foreign tx, not the settlement one.
    assert.equal(d.settlementAccountCheck.foreignTxCount, 1);
    assert.deepEqual(d.settlementAccountCheck.foreignTxHashes, ['FOREIGN1']);
    const missing = await app.inject({ url: '/api/v1/operators/99/profile' });
    assert.equal(missing.statusCode, 404);
    await app.close();
  });
});

describe('operator feed reads', () => {
  it('clock: silence is a state — no_status with 200, never a 404', async () => {
    const app = await build({ coreSlots: [coreSlot(1)] });
    const res = await app.inject({ url: '/api/v1/operators/1/status/clock' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.status, 'no_status');
    await app.close();
  });

  it('clock: serves the sample with envelope, marks stale-forward when as_height > indexed tip', async () => {
    const app = await build({
      blocks: [block(50)],
      operatorStatusSamples: [clockSample(3, { asHeight: 100n })],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/status/clock' });
    const d = res.json().data;
    assert.equal(d.status, 'ok');
    assert.equal(d.provenance, 'attested');
    assert.equal(d.staleForward, true); // 100 > tip 50 — hold it
    assert.equal(d.stale, true);
    assert.equal(d.payload.current_target.epoch, 497);
    await app.close();
  });

  it('epoch: verified when all four §6.5 checks hold (chain 2×100 payouts)', async () => {
    const app = await build({
      blocks: [block(200)],
      payouts: [
        payout(1, ADDR, 100, { slotId: 3n, epochNumber: 61n, amount: '100' }),
        payout(2, 'twilight1qvkpcjlfjqpzvh2en7rlrx0hz866z4st8phy04', 100, { slotId: 3n, epochNumber: 61n, amount: '100' }),
      ],
      operatorStatusSamples: [epochSample(3, 61, GOOD_EPOCH)],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/status/epochs/61' });
    const d = res.json().data;
    assert.equal(d.verification.result, 'verified');
    assert.deepEqual(d.verification.chain.payoutAmounts, ['100']);
    await app.close();
  });

  it('epoch: the all-zero remainder epoch (live epoch-50 shape) verifies — zero is a state', async () => {
    const zero = {
      state: 'SETTLEMENT_RECONCILED',
      counts: { enrolled: 0, eligible: 0, admitted: 0, not_eligible: {}, excluded: {} },
    };
    const app = await build({
      blocks: [block(200)],
      operatorStatusSamples: [epochSample(3, 50, zero)],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/status/epochs/50' });
    assert.equal(res.json().data.verification.result, 'verified');
    await app.close();
  });
});

describe('§6.5 checks each break independently (chain wins)', () => {
  const chain = { amounts: ['100'], recipients: 2n };

  it('share mismatch', () => {
    const v = verifyFeedEpoch({ ...GOOD_EPOCH, share: { amount: '99' } }, chain);
    assert.equal(v.result, 'mismatch');
    assert.deepEqual(v.failedChecks, ['share_equals_chain_payouts']);
  });
  it('admitted-vs-recipients mismatch', () => {
    const v = verifyFeedEpoch(
      { ...GOOD_EPOCH, counts: { ...GOOD_EPOCH.counts, admitted: 5, excluded: { EXCLUDED_BELOW_FLOOR: -2 } } },
      chain,
    );
    assert.ok(v.failedChecks.includes('admitted_equals_recipients'));
  });
  it('enrolled reconciliation failure', () => {
    const v = verifyFeedEpoch(
      { ...GOOD_EPOCH, counts: { ...GOOD_EPOCH.counts, enrolled: 9 } },
      chain,
    );
    assert.ok(v.failedChecks.includes('enrolled_reconciles'));
  });
  it('eligible reconciliation failure', () => {
    const v = verifyFeedEpoch(
      { ...GOOD_EPOCH, counts: { ...GOOD_EPOCH.counts, excluded: { EXCLUDED_BELOW_FLOOR: 7 } } },
      chain,
    );
    assert.ok(v.failedChecks.includes('eligible_reconciles'));
  });
  it('an open epoch is unverifiable, never guessed', () => {
    const v = verifyFeedEpoch({ state: 'OPEN' }, chain);
    assert.equal(v.result, 'unverifiable');
  });
});

describe('operator auth server', () => {
  const asSample = (slotId, kind, payload, over = {}) => ({
    sampleKey: `${slotId}:${kind}:-`,
    slotId: BigInt(slotId),
    kind,
    epochNumber: null,
    baseUrl: 'https://as.example',
    payloadJson: payload,
    sampledAt: null,
    asHeight: null,
    fetchedAt: new Date(),
    lastAttemptAt: new Date(),
    lastHttpStatus: 200,
    lastError: null,
    ...over,
  });
  const METADATA = {
    issuer: 'https://as.example',
    token_endpoint: 'https://as.example/oauth/token',
    dpop_signing_alg_values_supported: ['ES256'],
    grant_types_supported: ['urn:ietf:params:oauth:grant-type:device_code'],
  };
  const JWKS = { keys: [{ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig', kid: 'receipt-1' }] };

  it('serves metadata + jwks attested, reachable, fresh', async () => {
    const app = await build({
      operatorStatusSamples: [asSample(3, 'as_metadata', METADATA), asSample(3, 'as_jwks', JWKS)],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/auth' });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.status, 'ok');
    assert.equal(d.provenance, 'attested');
    assert.equal(d.reachable, true);
    assert.equal(d.stale, false);
    assert.equal(d.metadata.payload.issuer, 'https://as.example');
    assert.equal(d.jwks.payload.keys[0].kid, 'receipt-1');
    await app.close();
  });

  it('silence is a state — no_status with 200 for a slot with no AS samples', async () => {
    const app = await build({});
    const res = await app.inject({ url: '/api/v1/operators/1/auth' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.status, 'no_status');
    await app.close();
  });

  it('an outage reads unreachable + stale but still serves the last good metadata', async () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const app = await build({
      operatorStatusSamples: [
        asSample(3, 'as_metadata', METADATA, { fetchedAt: old, lastError: 'http 503' }),
      ],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/auth' });
    const d = res.json().data;
    assert.equal(d.status, 'ok');
    assert.equal(d.reachable, false);
    assert.equal(d.stale, true);
    assert.equal(d.metadata.payload.issuer, 'https://as.example'); // last good survives
    assert.equal(d.metadata.lastError, 'http 503');
    assert.equal(d.jwks, null);
    await app.close();
  });
});

describe('operator draw record', () => {
  const drawSample = (slotId, epochNumber, payload) => ({
    sampleKey: `${slotId}:draw:${epochNumber}`,
    slotId: BigInt(slotId), kind: 'draw', epochNumber: BigInt(epochNumber),
    baseUrl: 'https://as.example', payloadJson: payload,
    sampledAt: null, asHeight: null, fetchedAt: new Date(), lastAttemptAt: new Date(),
    lastHttpStatus: 200, lastError: null,
  });

  it('serves the stored draw record attested', async () => {
    const app = await build({
      blocks: [block(200)],
      operatorStatusSamples: [drawSample(3, 61, { outcome: 'NO_CANDIDATES', k: 0, anchor: { tx_hash: 'AB' } })],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/draw/61' });
    const d = res.json().data;
    assert.equal(d.status, 'ok');
    assert.equal(d.provenance, 'attested');
    assert.equal(d.payload.outcome, 'NO_CANDIDATES');
    await app.close();
  });

  it('no record = no_status with 200', async () => {
    const app = await build({});
    const res = await app.inject({ url: '/api/v1/operators/3/draw/61' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.status, 'no_status');
    await app.close();
  });
});

describe('operator auth health', () => {
  const healthSample = (over = {}) => ({
    sampleKey: '3:as_health:-', slotId: 3n, kind: 'as_health', epochNumber: null,
    baseUrl: 'https://as.example', payloadJson: { up: true, httpStatus: 200 },
    sampledAt: null, asHeight: null, fetchedAt: new Date(), lastAttemptAt: new Date(),
    lastHttpStatus: 200, lastError: null, ...over,
  });
  const meta = {
    sampleKey: '3:as_metadata:-', slotId: 3n, kind: 'as_metadata', epochNumber: null,
    baseUrl: 'https://as.example', payloadJson: { issuer: 'https://as.example' },
    sampledAt: null, asHeight: null, fetchedAt: new Date(), lastAttemptAt: new Date(),
    lastHttpStatus: 200, lastError: null,
  };

  it('reports up with check age', async () => {
    const app = await build({ operatorStatusSamples: [meta, healthSample()] });
    const d = (await app.inject({ url: '/api/v1/operators/3/auth' })).json().data;
    assert.equal(d.health.up, true);
    assert.ok(d.health.ageSeconds >= 0);
    await app.close();
  });

  it('reports down with how-long-since-last-ok during an outage', async () => {
    const lastOk = new Date(Date.now() - 10 * 60 * 1000);
    const app = await build({
      operatorStatusSamples: [meta, healthSample({ lastError: 'http 503', fetchedAt: lastOk })],
    });
    const d = (await app.inject({ url: '/api/v1/operators/3/auth' })).json().data;
    assert.equal(d.health.up, false);
    assert.ok(d.health.lastUpAgeSeconds >= 599);
    assert.equal(d.health.lastError, 'http 503');
    await app.close();
  });
});
