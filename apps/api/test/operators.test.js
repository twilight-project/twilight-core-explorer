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

describe('operator participants', () => {
  it('lists distinct paid addresses with totals + the attested enrolled count', async () => {
    const epochSampleOpen = {
      sampleKey: '3:epoch:70', slotId: 3n, kind: 'epoch', epochNumber: 70n,
      baseUrl: 'https://as.example',
      payloadJson: { state: 'OPEN', epoch: 70, counts: { enrolled: 3 } },
      sampledAt: null, asHeight: null, fetchedAt: new Date(), lastAttemptAt: new Date(),
      lastHttpStatus: 200, lastError: null,
    };
    const app = await build({
      blocks: [block(200)],
      payouts: [
        payout(1, 'twilight1aaa', 100, { slotId: 3n, epochNumber: 61n, amount: '100' }),
        payout(2, 'twilight1aaa', 150, { slotId: 3n, epochNumber: 62n, amount: '100' }),
        payout(3, 'twilight1bbb', 150, { slotId: 3n, epochNumber: 62n, amount: '100' }),
      ],
      operatorStatusSamples: [epochSampleOpen],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/participants' });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.paidAll, 2);
    assert.equal(d.provenance, 'chain');
    assert.equal(d.enrolled.enrolled, 3);
    assert.equal(d.enrolled.epochNumber, '70');
    assert.equal(d.enrolled.provenance, 'attested');
    const a = d.participants.find((x) => x.recipient === 'twilight1aaa');
    assert.equal(a.epochsPaid, 2);
    assert.equal(a.totalReceived, '200');
    await app.close();
  });

  it('empty slot: zero counts, empty list, null enrolled', async () => {
    const app = await build({});
    const d = (await app.inject({ url: '/api/v1/operators/9/participants' })).json().data;
    assert.equal(d.paidAll, 0);
    assert.deepEqual(d.participants, []);
    assert.equal(d.enrolled, null);
    await app.close();
  });
});

describe('param validation on operator routes (m3)', () => {
  const BAD_SLOT = ['abc', '-1', '9'.repeat(40), '1.5'];
  it('malformed or oversized slot ids answer 400 invalid_slot_id', async () => {
    const app = await build({});
    for (const bad of BAD_SLOT) {
      for (const path of [`/api/v1/operators/${bad}/participants`, `/api/v1/operators/${bad}/auth`, `/api/v1/operators/${bad}/draw/1`]) {
        const res = await app.inject({ url: path });
        assert.equal(res.statusCode, 400, path);
        assert.equal(res.json().error.code, 'invalid_slot_id', path);
      }
    }
    await app.close();
  });

  it('malformed or oversized epochs answer 400 invalid_epoch', async () => {
    const app = await build({});
    for (const bad of BAD_SLOT) {
      for (const path of [`/api/v1/operators/3/draw/${bad}`, `/api/v1/operators/3/status/epochs/${bad}`]) {
        const res = await app.inject({ url: path });
        assert.equal(res.statusCode, 400, path);
        assert.equal(res.json().error.code, 'invalid_epoch', path);
      }
    }
    await app.close();
  });
});

describe('30-day window close time (n1 regression)', () => {
  it('epochs with NULL RewardEpochProjection.blockTime still count via Block.time', async () => {
    const now = new Date();
    const app = await build({
      coreSlots: [coreSlot(3, { settlementAddress: null })],
      blocks: [{ ...block(100), time: new Date(now.getTime() - 60_000) }],
      epochs: [{ ...epoch(61), height: 100n, blockTime: null }],
      entitlements: [entitlement(1, 3, 61)],
      finalizations: [settlementFinalization(3, 61, 120)],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/profile' });
    assert.equal(res.statusCode, 200, res.body.slice(0, 200));
    const d = res.json().data;
    assert.equal(d.verdict.owed30, 1); // close_time coalesced from the Block row
    assert.equal(d.verdict.owedAll, 1);
    await app.close();
  });
});

describe('draw staleness is final, not clock-based (CR finding 2)', () => {
  it('an hours-old stored draw record is NOT stale (stale-forward still applies)', async () => {
    const old = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const app = await build({
      blocks: [block(200)],
      operatorStatusSamples: [{
        sampleKey: '3:draw:61', slotId: 3n, kind: 'draw', epochNumber: 61n,
        baseUrl: 'https://as.example', payloadJson: { outcome: 'NO_CANDIDATES', candidates: [] },
        sampledAt: null, asHeight: null, fetchedAt: old, lastAttemptAt: old,
        lastHttpStatus: 200, lastError: null,
      }],
    });
    const d = (await app.inject({ url: '/api/v1/operators/3/draw/61' })).json().data;
    assert.equal(d.status, 'ok');
    assert.equal(d.stale, false);
    await app.close();
  });
});

describe('settled feed epochs are final (round-2 C) + stable participant order', () => {
  const epochSample = (epochNumber, payload, fetchedAt) => ({
    sampleKey: `3:epoch:${epochNumber}`, slotId: 3n, kind: 'epoch', epochNumber: BigInt(epochNumber),
    baseUrl: 'https://as.example', payloadJson: payload,
    sampledAt: null, asHeight: null, fetchedAt, lastAttemptAt: fetchedAt,
    lastHttpStatus: 200, lastError: null,
  });

  it('a settled epoch sample is not stale however old; an OPEN one still is', async () => {
    const old = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const app = await build({
      blocks: [block(200)],
      operatorStatusSamples: [
        epochSample(61, { state: 'SETTLEMENT_RECONCILED', counts: { enrolled: 0, eligible: 0, admitted: 0, not_eligible: {}, excluded: {} } }, old),
        epochSample(62, { state: 'OPEN' }, old),
      ],
    });
    const settled = (await app.inject({ url: '/api/v1/operators/3/status/epochs/61' })).json().data;
    const open = (await app.inject({ url: '/api/v1/operators/3/status/epochs/62' })).json().data;
    assert.equal(settled.stale, false);
    assert.equal(open.stale, true);
    await app.close();
  });

  it('participants with equal totals come back in a stable address order', async () => {
    const app = await build({
      blocks: [block(200)],
      payouts: [
        payout(1, 'twilight1ccc', 100, { slotId: 3n, epochNumber: 61n, amount: '100' }),
        payout(2, 'twilight1aaa', 100, { slotId: 3n, epochNumber: 61n, amount: '100' }),
        payout(3, 'twilight1bbb', 100, { slotId: 3n, epochNumber: 61n, amount: '100' }),
      ],
    });
    const d = (await app.inject({ url: '/api/v1/operators/3/participants' })).json().data;
    assert.deepEqual(d.participants.map((p) => p.recipient), ['twilight1aaa', 'twilight1bbb', 'twilight1ccc']);
    await app.close();
  });
});

// Round-2: the draw route's own behaviour — attribution finality (M2), the verdict cache
// (MAJ-2) and the point-in-time policy lookup (MAJ-1).
describe('draw route: attribution finality, cache and policy lookup', () => {
  const drawSample = (payload) => ({
    sampleKey: '3:draw:1657', slotId: 3n, kind: 'draw', epochNumber: 1657n,
    baseUrl: 'https://as.example', payloadJson: payload,
    sampledAt: null, asHeight: null, fetchedAt: new Date('2026-10-29T00:00:00Z'),
    lastAttemptAt: new Date('2026-10-29T00:00:00Z'), lastHttpStatus: 200, lastError: null,
  });
  // A minimal two-candidate record; the window is deliberately NOT indexed here, so the
  // beacon check can only be null (never a pass) — which is the point of these tests.
  const RECORD = {
    version: 1, chain_id: 'twilight-testnet-1', slot_id: 3, target_epoch: 1657,
    parameters: {
      selection_params_version: 1, selection_policy_version: 1, selection_rate_bps: 2500,
      max_selected_participants: 10, max_selected_participants_per_selection: 64,
      max_candidates_per_selection: 1024, beacon_start_offset_blocks: 48,
      beacon_window_blocks: 24, chain_min_external_beacon_blocks: 12,
      chain_min_distinct_external_proposers: 3, min_external_beacon_blocks: 12,
      min_distinct_external_proposers: 3, exclude_target_slot_proposals: true,
    },
    anchor: { tx_hash: 'ab'.repeat(32), confirmed_height: 597022, committed_set_hash: '0'.repeat(63) + '1', committed_params_hash: '0'.repeat(63) + '2' },
    candidates: ['11'.repeat(32), '22'.repeat(32)],
    beacon: { start_height: 597070, end_height: 597093, hash: null, admissible: false, usable_blocks: 0, distinct_external_proposers: 0, excluded_target_blocks: 0, unattributable_blocks: 24 },
    outcome: 'NO_VALID_BEACON', k: 1, winners: [],
    candidate_set_hash: '0'.repeat(63) + '1', selected_draw_ids_hash: '0'.repeat(63) + '3',
  };

  it('M2: a non-final attribution row counts as missing, so the verdict is not green', async () => {
    const app = await build({
      indexerCursor: {
        chainId: 'twilight-testnet-1', lastIndexedHeight: 700000n, latestChainHeight: 700000n,
        status: 'idle', lastIndexedHash: 'abc', updatedAt: new Date(), error: null,
      },
      blocks: [block(200)],
      // the window block exists and has an attribution row, but it is NOT final
      attributions: [{ height: 597070n, proposerAddress: 'aa', rawProposerAddress: 'AA', slotId: 1n, operatorAddress: 'twilight1op', attributionStatus: 'ambiguous' }],
      operatorStatusSamples: [drawSample(RECORD)],
    });
    const d = (await app.inject({ url: '/api/v1/operators/3/draw/1657' })).json().data;
    assert.equal(d.status, 'ok');
    assert.notEqual(d.verification.result, 'verified');
    await app.close();
  });

  const CURSOR = {
    chainId: 'twilight-testnet-1', lastIndexedHeight: 700000n, latestChainHeight: 700000n,
    status: 'idle', lastIndexedHash: 'abc', updatedAt: new Date(), error: null,
  };
  // The record's anchor tx, indexed at the record's confirmed height.
  const ANCHOR_TX = { hash: 'AB'.repeat(32), height: 597022n, memo: null };
  // The structural projection (policy rows) has processed past the anchor.
  const STRUCTURAL = [{ projectionName: 'coreslot_structural_v1', chainId: 'twilight-testnet-1', lastProjectedHeight: 700000n, status: 'idle', updatedAt: new Date(), error: null }];
  const policyCheck = (d) => d.verification.checks.find((c) => c.name === 'parameters_match_chain_policy');
  const withPolicy = (over) => ({ ...RECORD, parameters: { ...RECORD.parameters, ...over } });
  const pol = (v, h, rate, max = 10n) =>
    ({ slotId: 3n, policyVersion: BigInt(v), selectionRateBps: rate, maxSelectedParticipants: max, height: BigInt(h) });

  it('verdict cache: entries expire (pending after 30 s, settled after 5 min) and are per app', async () => {
    const realNow = Date.now;
    let t = realNow();
    Date.now = () => t;
    try {
      // settled verdict: the published set hash is wrong → mismatch
      const app = await build({ indexerCursor: CURSOR, blocks: [block(200)], operatorStatusSamples: [drawSample(RECORD)] });
      let computes = 0;
      const findTx = app.prisma.explorerTransaction.findUnique;
      app.prisma.explorerTransaction.findUnique = async (a) => { computes++; return findTx(a); };
      const get = async () => (await app.inject({ url: '/api/v1/operators/3/draw/1657' })).json().data.verification;
      assert.equal((await get()).result, 'mismatch');
      await get();
      assert.equal(computes, 1, 'served from cache');
      t += 60_000;
      await get();
      assert.equal(computes, 1, 'a settled verdict is still cached after a minute');
      t += 5 * 60_000;
      await get();
      assert.equal(computes, 2, 'a settled verdict is recomputed after its TTL');
      await app.close();

      // pending verdict (no chain id indexed yet) → unverifiable, short TTL
      const pending = await build({ blocks: [block(200)], operatorStatusSamples: [drawSample(RECORD)] });
      let pendingComputes = 0;
      const findTx2 = pending.prisma.explorerTransaction.findUnique;
      pending.prisma.explorerTransaction.findUnique = async (a) => { pendingComputes++; return findTx2(a); };
      const getP = async () => (await pending.inject({ url: '/api/v1/operators/3/draw/1657' })).json().data.verification;
      assert.equal((await getP()).result, 'unverifiable');
      await getP();
      assert.equal(pendingComputes, 1, 'bursts of requests do not recompute');
      t += 31_000;
      await getP();
      assert.equal(pendingComputes, 2, 'an unverifiable verdict is recomputed after 30 s');
      await pending.close();
    } finally {
      Date.now = realNow;
    }
  });

  it('MAJ-1: the policy row is the one in force at the anchor height (not the newest row)', async () => {
    const app = await build({
      indexerCursor: CURSOR, blocks: [block(200)], txs: [ANCHOR_TX], projectionCursors: STRUCTURAL,
      operatorStatusSamples: [drawSample(RECORD)],
      selectionPolicyChanges: [pol(1, 500000, 2500), pol(2, 900000, 1000, 5n)],
    });
    const p = policyCheck((await app.inject({ url: '/api/v1/operators/3/draw/1657' })).json().data);
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.match(p.detail, /chain policy in force at the anchor: v1, rate 2500 bps, max 10/);
    await app.close();
  });

  it('NEW-B1: a record naming a superseded version is compared with the row actually in force', async () => {
    // v2 (2500) was replaced by v3 (1000) before the anchor; the record still names v2
    const app = await build({
      indexerCursor: CURSOR, blocks: [block(200)], txs: [ANCHOR_TX], projectionCursors: STRUCTURAL,
      operatorStatusSamples: [drawSample(withPolicy({ selection_policy_version: 2, selection_rate_bps: 2500 }))],
      selectionPolicyChanges: [pol(2, 500000, 2500), pol(3, 590000, 1000)],
    });
    const p = policyCheck((await app.inject({ url: '/api/v1/operators/3/draw/1657' })).json().data);
    assert.equal(p.ok, false, JSON.stringify(p));
    assert.match(p.detail, /in force at the anchor: v3, rate 1000 bps/);
    await app.close();
  });

  it('NEW-B1: a record naming a version created after the anchor does not verify', async () => {
    // v2 (1000) only exists from height 700000; the record (anchored at 597022) claims it
    const app = await build({
      indexerCursor: CURSOR, blocks: [block(200)], txs: [ANCHOR_TX], projectionCursors: STRUCTURAL,
      operatorStatusSamples: [drawSample(withPolicy({ selection_policy_version: 2, selection_rate_bps: 1000 }))],
      selectionPolicyChanges: [pol(1, 500000, 2500), pol(2, 700000, 1000)],
    });
    const p = policyCheck((await app.inject({ url: '/api/v1/operators/3/draw/1657' })).json().data);
    assert.equal(p.ok, false, JSON.stringify(p));
    await app.close();
  });

  it('a policy tx AT the anchor height is not yet in force (effective from H+1)', async () => {
    const app = await build({
      indexerCursor: CURSOR, blocks: [block(200)], txs: [ANCHOR_TX], projectionCursors: STRUCTURAL,
      operatorStatusSamples: [drawSample(RECORD)],
      selectionPolicyChanges: [pol(1, 500000, 2500), pol(2, 597022, 1000)],
    });
    const p = policyCheck((await app.inject({ url: '/api/v1/operators/3/draw/1657' })).json().data);
    assert.equal(p.ok, true, JSON.stringify(p));
    await app.close();
  });

  it('while the policy projection is behind the anchor, the comparison waits (no false accusation)', async () => {
    // an honest record names v3, whose row the structural projection has not reached yet
    const behind = [{ ...STRUCTURAL[0], lastProjectedHeight: 590000n }];
    const app = await build({
      indexerCursor: CURSOR, blocks: [block(200)], txs: [ANCHOR_TX], projectionCursors: behind,
      operatorStatusSamples: [drawSample(withPolicy({ selection_policy_version: 3 }))],
      selectionPolicyChanges: [pol(2, 500000, 2500)],
    });
    const p = policyCheck((await app.inject({ url: '/api/v1/operators/3/draw/1657' })).json().data);
    assert.equal(p.ok, null, JSON.stringify(p));
    assert.match(p.detail, /has not reached the anchor height/);
    await app.close();
  });

  it('without the anchor tx in the index, no policy row is compared (never guessed)', async () => {
    const app = await build({
      indexerCursor: CURSOR, blocks: [block(200)],
      operatorStatusSamples: [drawSample(RECORD)],
      selectionPolicyChanges: [pol(1, 500000, 2500)],
    });
    const d = (await app.inject({ url: '/api/v1/operators/3/draw/1657' })).json().data;
    assert.equal(policyCheck(d), undefined);
    assert.ok(d.verification.caveats.some((c) => /policy not indexed/.test(c)));
    await app.close();
  });
});

describe('operator history', () => {
  it('buckets owed epochs by close day with paid, kept, miners and the attested enrolled count', async () => {
    const day1 = new Date('2026-06-26T05:00:00.000Z');
    const day2 = new Date('2026-06-27T05:00:00.000Z');
    const app = await build({
      blocks: [block(100, { time: day1 }), block(160, { time: day1 }), block(250, { time: day2 })],
      epochs: [
        epoch(61, { height: 100n, blockTime: day1 }),
        epoch(62, { height: 150n, blockTime: day1 }),
        epoch(63, { height: 240n, blockTime: day2 }),
      ],
      entitlements: [
        entitlement(1, 3n, 61, { entitlementAmount: '300' }),
        entitlement(2, 3n, 62, { entitlementAmount: '300' }),
        entitlement(3, 3n, 63, { entitlementAmount: '300' }),
      ],
      finalizations: [
        settlementFinalization(3n, 61, 105, { releasedRemainder: '100' }),
        settlementFinalization(3n, 62, 160, { releasedRemainder: '0' }),
      ],
      payouts: [
        payout(1, 'twilight1aaa', 100, { slotId: 3n, epochNumber: 61n, amount: '200' }),
        payout(2, 'twilight1aaa', 160, { slotId: 3n, epochNumber: 62n, amount: '150' }),
        payout(3, 'twilight1bbb', 160, { slotId: 3n, epochNumber: 62n, amount: '150' }),
        payout(4, 'twilight1bbb', 250, { slotId: 3n, epochNumber: 63n, amount: '300' }),
      ],
      operatorStatusSamples: [
        {
          sampleKey: '3:epoch:62', slotId: 3n, kind: 'epoch', epochNumber: 62n,
          baseUrl: 'https://as.example',
          payloadJson: { state: 'SETTLEMENT_RECONCILED', counts: { enrolled: 4, admitted: 2 } },
          sampledAt: null, asHeight: null, fetchedAt: new Date(), lastAttemptAt: new Date(),
          lastHttpStatus: 200, lastError: null,
        },
      ],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/history' });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.provenance, 'chain');
    assert.equal(d.days.length, 2);
    const [a, b] = d.days;
    assert.equal(a.day, '2026-06-26');
    assert.equal(a.epochs, 2);
    assert.equal(a.settledEpochs, 2);
    assert.equal(a.entitlement, '600');
    assert.equal(a.paid, '500');
    assert.equal(a.kept, '100');
    assert.equal(a.payouts, 3);
    assert.equal(a.activeMiners, 2);
    assert.equal(a.newMiners, 2);
    assert.equal(a.feed.epochs, 1);
    assert.equal(a.feed.avgEnrolled, 4);
    assert.equal(a.feed.admitted, 2);
    assert.equal(a.feed.provenance, 'attested');
    assert.equal(b.day, '2026-06-27');
    assert.equal(b.settledEpochs, 0);
    assert.equal(b.medianLatencyBlocks, null);
    assert.equal(b.activeMiners, 1);
    assert.equal(b.newMiners, 0);
    assert.equal(b.feed.avgEnrolled, null);
    await app.close();
  });

  const historySample = (epochNumber, counts) => ({
    sampleKey: `3:epoch:${epochNumber}`, slotId: 3n, kind: 'epoch', epochNumber: BigInt(epochNumber),
    baseUrl: 'https://as.example', payloadJson: { state: 'SETTLEMENT_RECONCILED', counts },
    sampledAt: null, asHeight: null, fetchedAt: new Date(), lastAttemptAt: new Date(),
    lastHttpStatus: 200, lastError: null,
  });

  it('B1: a non-integer or huge attested count is ignored; the chain figures still come back', async () => {
    const day1 = new Date('2026-06-26T05:00:00.000Z');
    const app = await build({
      blocks: [block(100, { time: day1 })],
      epochs: [epoch(61, { height: 100n, blockTime: day1 }), epoch(62, { height: 110n, blockTime: day1 }), epoch(63, { height: 120n, blockTime: day1 })],
      entitlements: [
        entitlement(1, 3n, 61, { entitlementAmount: '300' }),
        entitlement(2, 3n, 62, { entitlementAmount: '300' }),
        entitlement(3, 3n, 63, { entitlementAmount: '300' }),
      ],
      payouts: [payout(1, 'twilight1aaa', 100, { slotId: 3n, epochNumber: 61n, amount: '200' })],
      operatorStatusSamples: [
        historySample(61, { enrolled: 4.5, admitted: 2 }),
        historySample(62, { enrolled: 3000000000, admitted: 1e12 }),
        historySample(63, { enrolled: 7, admitted: 3 }),
      ],
    });
    const res = await app.inject({ url: '/api/v1/operators/3/history' });
    assert.equal(res.statusCode, 200);
    const [a] = res.json().data.days;
    assert.equal(a.entitlement, '900'); // chain figures intact
    assert.equal(a.paid, '200');
    assert.equal(a.feed.epochs, 1); // only the plain integer counts
    assert.equal(a.feed.avgEnrolled, 7);
    assert.equal(a.feed.maxEnrolled, 7);
    assert.equal(a.feed.admitted, 5); // 2 (epoch 61, a plain integer) + 3; 1e12 ignored
    await app.close();
  });

  it('M1: a payout made on a day with no epoch close is counted on its epoch\'s close day', async () => {
    const day1 = new Date('2026-06-26T05:00:00.000Z');
    const day2 = new Date('2026-06-27T05:00:00.000Z');
    const late = new Date('2026-06-29T05:00:00.000Z'); // no epoch closes on this day
    const app = await build({
      blocks: [block(100, { time: day1 }), block(250, { time: day2 }), block(400, { time: late })],
      epochs: [epoch(61, { height: 100n, blockTime: day1 }), epoch(63, { height: 240n, blockTime: day2 })],
      entitlements: [
        entitlement(1, 3n, 61, { entitlementAmount: '300' }),
        entitlement(3, 3n, 63, { entitlementAmount: '300' }),
      ],
      payouts: [
        payout(1, 'twilight1aaa', 100, { slotId: 3n, epochNumber: 61n, amount: '100' }),
        payout(2, 'twilight1bbb', 250, { slotId: 3n, epochNumber: 63n, amount: '100' }),
        // a late settlement of epoch 63, paid at a block on a day with no epoch close
        payout(3, 'twilight1ccc', 400, { slotId: 3n, epochNumber: 63n, amount: '100' }),
      ],
    });
    const d = (await app.inject({ url: '/api/v1/operators/3/history' })).json().data;
    assert.deepEqual(d.days.map((x) => x.day), ['2026-06-26', '2026-06-27']);
    const totalNew = d.days.reduce((n, x) => n + x.newMiners, 0);
    assert.equal(totalNew, 3, 'every distinct miner is counted once'); // was 2: ccc's day was dropped
    assert.equal(d.days[1].activeMiners, 2); // bbb and ccc, both settling epoch 63
    await app.close();
  });

  it('empty slot: no days', async () => {
    const app = await build({});
    const d = (await app.inject({ url: '/api/v1/operators/9/history' })).json().data;
    assert.deepEqual(d.days, []);
    await app.close();
  });
});
