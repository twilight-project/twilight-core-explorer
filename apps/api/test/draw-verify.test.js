import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  candidateSetHashV1,
  selectedDrawIdsHashV1,
  verifyDraw,
  winnerCount,
} from '../dist/lib/draw-verify.js';

const libSync = () => ({ candidateSetHashV1, selectedDrawIdsHashV1 });
const verifyDrawEmptySelected = () =>
  selectedDrawIdsHashV1('twilight-testnet-1', 3n, 1657n, []).toString('hex');

// GOLDEN VECTOR: the real slot-3 epoch-1657 draw record published by rewards.nyks.dev
// (the first real draw on twilight-testnet-1) plus the 24 beacon-window blocks exactly as
// this explorer indexed them (block-id hash + attributed proposer slot). A faithful port of
// twilight-minis internal/selectionv1 must reproduce every digest in the record.
const RECORD = {"k": 1, "anchor": {"tx_hash": "1f638f348f53a8301aaac4e4273c4d79015919f2fee72bc630fb98bdd3593ee6", "confirmed_height": 597022, "committed_set_hash": "9539cac0508da4c9e83079053cadd2f88392724c44856351048f8a41f987926f", "committed_params_hash": "36c8ee0e661da9a90194bbb105c14e644d717ef83831c1b7fa3c8b5402e1e89c"}, "beacon": {"hash": "c8a42a9417010c5235d26a471b1f50b3008be2ed7c141a4171c02f88b6df5af5", "admissible": true, "end_height": 597093, "start_height": 597070, "usable_blocks": 18, "unattributable_blocks": 0, "excluded_target_blocks": 6, "distinct_external_proposers": 3}, "outcome": "SUCCESS", "slot_id": 3, "version": 1, "winners": ["e544b4b79969d1be15a1d32a226a5b6a56d07feabd4d26f1e2317aa37fbcdf84"], "chain_id": "twilight-testnet-1", "candidates": ["11a30b208290072dab2411295bdc92ef02aa32bf57ccda03efcdd89913f98c0e", "e544b4b79969d1be15a1d32a226a5b6a56d07feabd4d26f1e2317aa37fbcdf84"], "parameters": {"selection_rate_bps": 2500, "beacon_window_blocks": 24, "selection_params_version": 1, "selection_policy_version": 1, "max_selected_participants": 10, "beacon_start_offset_blocks": 48, "min_external_beacon_blocks": 12, "max_candidates_per_selection": 1024, "exclude_target_slot_proposals": true, "min_distinct_external_proposers": 3, "chain_min_external_beacon_blocks": 12, "chain_min_distinct_external_proposers": 3, "max_selected_participants_per_selection": 64}, "target_epoch": 1657, "candidate_set_hash": "9539cac0508da4c9e83079053cadd2f88392724c44856351048f8a41f987926f", "selected_draw_ids_hash": "fe1ee23fbb4524f20ee36d9bb52ded7e812caf2626ae608eca68d55782802b82"};
const BLOCKS = [{"height": "597070", "hash": "D03CAAC083DBD9806AAF749BD919B2C71C0D3CE6D9BB23BB1AD1FE1EF6B66939", "proposerSlotId": "4"}, {"height": "597071", "hash": "9352C5328F5F571F2D120EBD52CEA2419A718790090C8E10FB8D0CF4A9EFE84E", "proposerSlotId": "3"}, {"height": "597072", "hash": "D26D3B81F1CC8FD92764E4CCB35211250E1304D1C5D9A8C3FB9B6452654541F9", "proposerSlotId": "1"}, {"height": "597073", "hash": "F4FB6F3BEF627CC745FD89716C2004A2C9853E76FFBF91EFDED5ABEF0FD66020", "proposerSlotId": "2"}, {"height": "597074", "hash": "5203F2650110F1413C64FB86A30C2174D0372985137B6325BC1BAC73346ACE17", "proposerSlotId": "4"}, {"height": "597075", "hash": "BEE9698C02874A86CAB51BB919D895F098D547E933F2F4ECA28416E4AE6921B6", "proposerSlotId": "3"}, {"height": "597076", "hash": "42344A825CBFF9EEBDF1248AF95A20F19A11FCC280B2312DAC4B88A9B6582FDA", "proposerSlotId": "1"}, {"height": "597077", "hash": "753E66267796582CF3710643675B3169ECE9B2BEFF9D64D42CC987840B9D953C", "proposerSlotId": "2"}, {"height": "597078", "hash": "5914ADF8C5CD56664A32C846213DB41FA49251583560B791DCB785F1FFA52A03", "proposerSlotId": "4"}, {"height": "597079", "hash": "7639B446C81940EBC4B5A5909A0CD40A7572ACB7066821F4CFE70D73D344756A", "proposerSlotId": "3"}, {"height": "597080", "hash": "A70DFCA4CA04BE855F00EDC88BAF4EA581A807B298CF6F735F2DC4E4A8030AD7", "proposerSlotId": "1"}, {"height": "597081", "hash": "A78A11CC331EC5EF2AB9205B87B1983937F18508EA2C19C4FCEF628848E83CDC", "proposerSlotId": "2"}, {"height": "597082", "hash": "6D2D8837A14CE8D6E5ABC8A74F3B3C72CD8DDFC155E92DF04EB7377A4617FA31", "proposerSlotId": "4"}, {"height": "597083", "hash": "201A1625D749AC5AD089FEEB8222237638A6BF8E412F8A80D049D439A32637CD", "proposerSlotId": "3"}, {"height": "597084", "hash": "974AFBEC6DFA7DA9C1A70404916FD4F177FBC6B8D6541AD867DE4353420925E8", "proposerSlotId": "1"}, {"height": "597085", "hash": "5B52494D678B6D1EEB140DB26DEB4CDCEADDD14F497260FA086392B54F1F1667", "proposerSlotId": "2"}, {"height": "597086", "hash": "D9E51D95459D10B1D5C900101E94DD9E83C384E96D63485A94C03DCC28C2D9FB", "proposerSlotId": "4"}, {"height": "597087", "hash": "0CBEAB28E2FA663E0766062FEF8AC5E00F89761A35157A8F01FEC6D0E6D99CCC", "proposerSlotId": "3"}, {"height": "597088", "hash": "309253F0CBF8AA81200EBDA6341F788F5D591E42C0357AE7A941548D17022343", "proposerSlotId": "1"}, {"height": "597089", "hash": "A6F2A69698BA44062E4AC9C118C40CE771B66A2D580849C81D067DF331602273", "proposerSlotId": "2"}, {"height": "597090", "hash": "57860DD778F7C19B8340D63D2D708261075E39AB82D33B36D32311055F7FCA77", "proposerSlotId": "4"}, {"height": "597091", "hash": "0D0A2B9F7688CA42D0F9869ADAC6A2B51889D2CF2CF03979BBCF64FCFA9ACBE6", "proposerSlotId": "3"}, {"height": "597092", "hash": "1DEE47EAEC7148B19AB18FD0A5AF4B0BF2557FFA090C02BDBE60A95510A8CC07", "proposerSlotId": "1"}, {"height": "597093", "hash": "3CCA1D42B907C5D088CF0EF2F28AEFEEF61691D1E2392E0A0639439B34BBC717", "proposerSlotId": "2"}].map((b) => ({
  height: BigInt(b.height), hash: b.hash,
  proposerSlotId: b.proposerSlotId === null ? null : BigInt(b.proposerSlotId),
}));
// n3: the memo below is the EXACT string carried by tx 1f638f34… on twilight-testnet-1
// (block 597022) — taken from the chain, not rebuilt from the record, so this also proves
// the strict drawanchor.Decode-compatible parsing accepts the real producer's bytes.
const ANCHOR = {
  memo: '{"v":1,"slot":3,"epoch":1657,"set":"9539cac0508da4c9e83079053cadd2f88392724c44856351048f8a41f987926f","params":"36c8ee0e661da9a90194bbb105c14e644d717ef83831c1b7fa3c8b5402e1e89c"}',
  height: BigInt(RECORD.anchor.confirmed_height),
};
const INPUT = { chainId: 'twilight-testnet-1', slotId: 3n, epoch: 1657n, record: RECORD, anchor: ANCHOR, blocks: BLOCKS };

describe('draw verification (selectionv1 port)', () => {
  it('reproduces every digest of the real epoch-1657 record: verified', () => {
    const v = verifyDraw(INPUT);
    const byName = Object.fromEntries(v.checks.map((c) => [c.name, c]));
    for (const [name, c] of Object.entries(byName)) assert.equal(c.ok, true, name + ': ' + c.detail);
    assert.equal(v.result, 'verified');
  });

  it('a tampered winner is caught as mismatch', () => {
    const forged = JSON.parse(JSON.stringify(RECORD));
    forged.winners = [forged.candidates.find((c) => c !== forged.winners[0])];
    const v = verifyDraw({ ...INPUT, record: forged });
    assert.equal(v.result, 'mismatch');
    assert.equal(v.checks.find((c) => c.name === 'winners_redrawn').ok, false);
  });

  it('a tampered candidate list is rejected as non-canonical: mismatch', () => {
    const forged = JSON.parse(JSON.stringify(RECORD));
    forged.candidates = [...forged.candidates].reverse(); // unsorted = non-canonical
    const v = verifyDraw({ ...INPUT, record: forged });
    assert.equal(v.checks.find((c) => c.name === 'candidates_canonical').ok, false);
    assert.equal(v.result, 'mismatch');
  });

  it('missing window blocks degrade to unverifiable, never to mismatch', () => {
    const v = verifyDraw({ ...INPUT, blocks: BLOCKS.slice(0, 10) });
    assert.equal(v.result, 'unverifiable');
    assert.equal(v.checks.find((c) => c.name === 'beacon_recomputed').ok, null);
  });

  it('winnerCount: C=0→0, C=1→1, 25% with caps', () => {
    assert.equal(winnerCount(0n, 2500n, 10n, 64n), 0n);
    assert.equal(winnerCount(1n, 2500n, 10n, 64n), 1n);
    assert.equal(winnerCount(2n, 2500n, 10n, 64n), 1n); // floor(C/2) cap
    assert.equal(winnerCount(8n, 2500n, 10n, 64n), 2n);
    assert.equal(winnerCount(100n, 2500n, 10n, 64n), 10n); // M cap
  });
});

// n4: every outcome path + the adversarial probes from the #93 review (B1/B2/M1/M2/M3/M4).
describe('draw verification — outcome re-derivation and forgeries', () => {
  const forge = (over) => ({ ...INPUT, record: { ...JSON.parse(JSON.stringify(RECORD)), ...over } });
  const check = (v, name) => v.checks.find((c) => c.name === name);

  it('B1: NO_VALID_BEACON claimed over a VALID window is a mismatch', () => {
    const v = verifyDraw(forge({ outcome: 'NO_VALID_BEACON', winners: [], k: 1,
      beacon: { ...RECORD.beacon, admissible: false, hash: null } }));
    assert.equal(v.result, 'mismatch');
    // the beacon recomputation itself contradicts the record (we find it admissible)
    assert.equal(check(v, 'beacon_recomputed').ok, false);
  });

  it('B1: beacon stripped to null with two candidates is a mismatch', () => {
    const v = verifyDraw(forge({ outcome: 'NO_VALID_BEACON', winners: [], beacon: null }));
    assert.equal(v.result, 'mismatch');
    assert.equal(check(v, 'beacon_recomputed').ok, false);
  });

  it('B1: an unknown outcome with forged winners is a mismatch', () => {
    const v = verifyDraw(forge({ outcome: 'garbage' }));
    assert.equal(v.result, 'mismatch');
    assert.equal(check(v, 'outcome_rederived').ok, false);
  });

  it('B1: SUCCESS published over an INADMISSIBLE window is a mismatch', () => {
    // all 24 window blocks proposed by one external slot -> distinct=1 < threshold 3
    const monoBlocks = BLOCKS.map((b) => ({ ...b, proposerSlotId: 1n }));
    const v = verifyDraw({ ...forge({}), blocks: monoBlocks });
    assert.equal(v.result, 'mismatch');
    assert.equal(check(v, 'outcome_rederived').ok, false); // expected NO_VALID_BEACON
  });

  it('M1: an HONEST NO_VALID_BEACON (null hash, true counts) verifies', () => {
    const monoBlocks = BLOCKS.map((b) => ({ ...b, proposerSlotId: b.proposerSlotId === 3n ? 3n : 1n }));
    const usable = monoBlocks.filter((b) => b.proposerSlotId !== 3n).length;
    const v = verifyDraw({
      ...forge({
        outcome: 'NO_VALID_BEACON', winners: [], k: 1,
        selected_draw_ids_hash: verifyDrawEmptySelected(),
        beacon: { ...RECORD.beacon, admissible: false, hash: null,
          usable_blocks: usable, distinct_external_proposers: 1,
          excluded_target_blocks: 24 - usable, unattributable_blocks: 0 },
      }),
      blocks: monoBlocks,
    });
    assert.equal(v.result, 'verified', JSON.stringify(v.checks));
  });

  it('B2: an absurd window bound is rejected fast, without iterating it', () => {
    const t0 = Date.now();
    const v = verifyDraw(forge({ beacon: { ...RECORD.beacon, end_height: '99999999999999999999' } }));
    const ms = Date.now() - t0;
    assert.equal(check(v, 'beacon_window_placement').ok, false);
    assert.equal(v.result, 'mismatch');
    assert.ok(ms < 1000, `took ${ms}ms`);
  });

  it('M2: missing proposer attribution degrades to unverifiable, never verified', () => {
    const unattributed = BLOCKS.map((b) => ({ ...b, proposerSlotId: null }));
    const v = verifyDraw({ ...forge({}), blocks: unattributed });
    assert.equal(v.result, 'unverifiable');
    assert.equal(check(v, 'beacon_recomputed').ok, null);
  });

  it('M3: duplicate, all-zero and uppercase candidate ids are non-canonical', () => {
    for (const cands of [
      [RECORD.candidates[0], RECORD.candidates[0]],
      ['0'.repeat(64)],
      [RECORD.candidates[0].toUpperCase()],
    ]) {
      const v = verifyDraw(forge({ candidates: cands }));
      assert.equal(check(v, 'candidates_canonical').ok, false, JSON.stringify(cands[0]).slice(0, 20));
      assert.equal(v.result, 'mismatch');
    }
  });

  it('M4: parameters that contradict the indexed chain policy are a mismatch', () => {
    const v = verifyDraw({ ...forge({}), chainPolicy: { policyVersion: 1n, selectionRateBps: 1000n, maxSelectedParticipants: 10n } });
    assert.equal(check(v, 'parameters_match_chain_policy').ok, false);
    assert.equal(v.result, 'mismatch');
    const ok = verifyDraw({ ...forge({}), chainPolicy: { policyVersion: 1n, selectionRateBps: 2500n, maxSelectedParticipants: 10n } });
    assert.equal(check(ok, 'parameters_match_chain_policy').ok, true);
    assert.equal(ok.result, 'verified');
  });

  it('honest NO_CANDIDATES verifies, with the empty-winners digest checked', () => {
    const { candidateSetHashV1, selectedDrawIdsHashV1 } = libSync();
    const setHash = candidateSetHashV1('twilight-testnet-1', 3n, 1657n, []).toString('hex');
    const memo = `{"v":1,"slot":3,"epoch":1657,"set":"${setHash}","params":"${RECORD.anchor.committed_params_hash}"}`;
    const v = verifyDraw({
      ...forge({
        outcome: 'NO_CANDIDATES', candidates: [], winners: null, k: 0, beacon: null,
        candidate_set_hash: setHash,
        selected_draw_ids_hash: selectedDrawIdsHashV1('twilight-testnet-1', 3n, 1657n, []).toString('hex'),
        anchor: { ...RECORD.anchor, committed_set_hash: setHash },
      }),
      anchor: { memo, height: BigInt(RECORD.anchor.confirmed_height) },
      blocks: [],
    });
    assert.equal(v.result, 'verified', JSON.stringify(v.checks));
    assert.equal(check(v, 'winners_redrawn').ok, true);
    assert.equal(check(v, 'selected_draw_ids_hash').ok, true);
  });

  it('C=1 wins without a beacon', () => {
    const { candidateSetHashV1, selectedDrawIdsHashV1 } = libSync();
    const only = RECORD.candidates[0];
    const setHash = candidateSetHashV1('twilight-testnet-1', 3n, 1657n, [Buffer.from(only, 'hex')]).toString('hex');
    const memo = `{"v":1,"slot":3,"epoch":1657,"set":"${setHash}","params":"${RECORD.anchor.committed_params_hash}"}`;
    const v = verifyDraw({
      ...forge({
        outcome: 'SUCCESS', candidates: [only], winners: [only], k: 1, beacon: null,
        candidate_set_hash: setHash,
        selected_draw_ids_hash: selectedDrawIdsHashV1('twilight-testnet-1', 3n, 1657n, [Buffer.from(only, 'hex')]).toString('hex'),
        anchor: { ...RECORD.anchor, committed_set_hash: setHash },
      }),
      anchor: { memo, height: BigInt(RECORD.anchor.confirmed_height) },
      blocks: [],
    });
    assert.equal(v.result, 'verified', JSON.stringify(v.checks));
  });
});

// Round-2 blockers/majors: the full parameter validation port, the point-in-time policy
// comparison and the record-shape rules.
describe('parameter validation port (round-2 BLK-1)', () => {
  const base = JSON.parse(JSON.stringify(RECORD));
  const withParams = (over) => ({
    ...INPUT,
    record: { ...base, parameters: { ...base.parameters, ...over } },
  });
  const paramsCheck = (v) => v.checks.find((c) => c.name === 'parameters_valid');

  it('the real record passes every rule', () => {
    assert.equal(paramsCheck(verifyDraw(INPUT)).ok, true);
  });

  const cases = [
    ['zero selection_params_version', { selection_params_version: 0 }],
    ['zero selection_policy_version', { selection_policy_version: 0 }],
    ['zero beacon_start_offset_blocks (seed already visible at commit)', { beacon_start_offset_blocks: 0 }],
    ['zero beacon_window_blocks', { beacon_window_blocks: 0 }],
    ['zero max_candidates_per_selection', { max_candidates_per_selection: 0 }],
    ['zero chain_min_external_beacon_blocks', { chain_min_external_beacon_blocks: 0 }],
    ['zero chain_min_distinct_external_proposers', { chain_min_distinct_external_proposers: 0 }],
    ['applied min_external ABOVE the chain minimum', { min_external_beacon_blocks: 13 }],
    ['applied min_distinct ABOVE the chain minimum', { min_distinct_external_proposers: 4 }],
    ['zero applied min_external', { min_external_beacon_blocks: 0 }],
    ['zero applied min_distinct', { min_distinct_external_proposers: 0 }],
    ['min_distinct greater than min_external', { min_distinct_external_proposers: 12, min_external_beacon_blocks: 11, chain_min_external_beacon_blocks: 11, chain_min_distinct_external_proposers: 12 }],
    ['min_external longer than the window', { beacon_window_blocks: 10 }],
    ['selection_rate_bps above 5000', { selection_rate_bps: 5001 }],
    ['selection_rate_bps zero', { selection_rate_bps: 0 }],
  ];
  for (const [name, over] of cases) {
    it(`refuses ${name}`, () => {
      const v = verifyDraw(withParams(over));
      assert.equal(paramsCheck(v).ok, false, name);
      assert.equal(v.result, 'mismatch', name);
    });
  }

  it('refuses exclude_target_slot_proposals: false', () => {
    const v = verifyDraw(withParams({ exclude_target_slot_proposals: false }));
    assert.equal(paramsCheck(v).ok, false);
  });
});

describe('record shape and policy comparison (round-2 minors + MAJ-1)', () => {
  const check = (v, name) => v.checks.find((c) => c.name === name);
  const forge = (over) => ({ ...INPUT, record: { ...JSON.parse(JSON.stringify(RECORD)), ...over } });

  it('a record for another chain, slot, epoch or version is refused', () => {
    for (const over of [
      { chain_id: 'twilight-mainnet-1' },
      { slot_id: 4 },
      { target_epoch: 1658 },
      { version: 2 },
    ]) {
      const v = verifyDraw(forge(over));
      assert.equal(check(v, 'record_shape').ok, false, JSON.stringify(over));
      assert.equal(v.result, 'mismatch');
    }
  });

  it('a non-string winner entry is refused instead of silently dropped', () => {
    const v = verifyDraw(forge({ winners: [RECORD.winners[0], 42] }));
    assert.equal(check(v, 'record_shape').ok, false);
  });

  it('fewer than two candidates must not carry a beacon section', () => {
    // Build an OTHERWISE valid single-candidate record (own set hash, own anchor memo,
    // empty-winner digest for its k=1 winner) and then attach the illegal beacon section.
    const only = RECORD.candidates[0];
    const setHash = candidateSetHashV1('twilight-testnet-1', 3n, 1657n, [
      Buffer.from(only, 'hex'),
    ]).toString('hex');
    const memo = `{"v":1,"slot":3,"epoch":1657,"set":"${setHash}","params":"${RECORD.anchor.committed_params_hash}"}`;
    const record = {
      ...JSON.parse(JSON.stringify(RECORD)),
      candidates: [only],
      winners: [only],
      k: 1,
      outcome: 'SUCCESS',
      candidate_set_hash: setHash,
      selected_draw_ids_hash: selectedDrawIdsHashV1('twilight-testnet-1', 3n, 1657n, [
        Buffer.from(only, 'hex'),
      ]).toString('hex'),
      anchor: { ...RECORD.anchor, committed_set_hash: setHash },
    };
    const anchor = { memo, height: BigInt(RECORD.anchor.confirmed_height) };
    // Without a beacon section it verifies...
    const clean = verifyDraw({ ...INPUT, record: { ...record, beacon: null }, anchor, blocks: [] });
    assert.equal(clean.result, 'verified', JSON.stringify(clean.checks));
    // ...and with one it is refused.
    const withBeacon = verifyDraw({ ...INPUT, record, anchor, blocks: BLOCKS });
    assert.equal(check(withBeacon, 'beacon_shape').ok, false);
    assert.equal(withBeacon.result, 'mismatch');
  });

  it('MAJ-1: the policy version the record names is what gets compared', () => {
    // An older draw (policy v1) judged against the row in force then: verified.
    const atAnchor = verifyDraw({
      ...INPUT,
      chainPolicy: { policyVersion: 1n, selectionRateBps: 2500n, maxSelectedParticipants: 10n },
    });
    assert.equal(check(atAnchor, 'parameters_match_chain_policy').ok, true);
    assert.equal(atAnchor.result, 'verified');
    // The same draw judged against a LATER policy row would be a false accusation; the
    // version mismatch is what catches the wrong row being supplied.
    const laterRow = verifyDraw({
      ...INPUT,
      chainPolicy: { policyVersion: 2n, selectionRateBps: 2500n, maxSelectedParticipants: 10n },
    });
    assert.equal(check(laterRow, 'parameters_match_chain_policy').ok, false);
  });

  it('a green verdict always carries its caveats', () => {
    const v = verifyDraw({
      ...INPUT,
      chainPolicy: { policyVersion: 1n, selectionRateBps: 2500n, maxSelectedParticipants: 10n },
    });
    assert.equal(v.result, 'verified');
    assert.ok(v.caveats.some((c) => /single-anchor/i.test(c)));
    assert.ok(v.caveats.some((c) => /not compared with the chain/i.test(c)));
  });

  it('the candidate cap from the parameters is enforced', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      (i + 1).toString(16).padStart(64, '0'),
    );
    const v = verifyDraw({
      ...INPUT,
      record: {
        ...JSON.parse(JSON.stringify(RECORD)),
        candidates: many,
        parameters: { ...RECORD.parameters, max_candidates_per_selection: 4 },
      },
    });
    assert.equal(v.checks.find((c) => c.name === 'candidates_canonical').ok, false);
  });
});

describe('round-3 fixes: explorer limits, malformed digests, relaxation, policy detail', () => {
  const recordWith = (mutate) => {
    const r = JSON.parse(JSON.stringify(RECORD));
    mutate(r);
    return { ...INPUT, record: r };
  };
  const check = (v, name) => v.checks.find((c) => c.name === name);

  it("an explorer-side limit is unverifiable, never a mismatch (m1)", () => {
    // the chain allows a window this explorer will not re-derive
    const big = verifyDraw(recordWith((r) => { r.parameters.beacon_window_blocks = 4096; }));
    assert.equal(check(big, 'parameters_valid').ok, null);
    assert.equal(big.result, 'unverifiable');
    // and a valid uint64 beyond what we can represent exactly
    const huge = verifyDraw(recordWith((r) => { r.parameters.max_selected_participants = '10000000000000'; }));
    assert.equal(check(huge, 'parameters_valid').ok, null);
    assert.equal(huge.result, 'unverifiable');
    // whereas a non-number is the operator's error
    const junk = verifyDraw(recordWith((r) => { r.parameters.max_selected_participants = 'ten'; }));
    assert.equal(check(junk, 'parameters_valid').ok, false);
    assert.equal(junk.result, 'mismatch');
  });

  it('a missing or wrongly-typed published digest is a mismatch, decided before the re-derivation (NEW-M2)', () => {
    for (const mutate of [
      (r) => { r.candidate_set_hash = 1; },
      (r) => { r.anchor.committed_set_hash = null; },
      (r) => { r.anchor.committed_params_hash = undefined; },
      (r) => { r.selected_draw_ids_hash = null; },
    ]) {
      const v = verifyDraw(recordWith(mutate));
      assert.equal(v.result, 'mismatch', JSON.stringify(v.checks.filter((c) => c.ok !== true)));
    }
    // the set-hash case stops at the foundation check: no winners are re-derived
    const early = verifyDraw(recordWith((r) => { r.candidate_set_hash = 1; }));
    assert.equal(check(early, 'winners_redrawn'), undefined);
  });

  it('relaxed thresholds are published as a caveat (m3)', () => {
    const v = verifyDraw(recordWith((r) => {
      r.parameters.min_external_beacon_blocks = 6;
    }));
    assert.ok(v.caveats.some((c) => /relaxed below the chain's: applied 6 usable blocks/.test(c)), v.caveats.join(' | '));
    // the real record applies the chain's own thresholds: no relaxation caveat
    assert.ok(!verifyDraw(INPUT).caveats.some((c) => /relaxed/.test(c)));
  });

  it("the policy detail shows the chain row's values next to the record's (m2)", () => {
    const v = verifyDraw({
      ...INPUT,
      chainPolicy: { policyVersion: 3n, selectionRateBps: 1000n, maxSelectedParticipants: 5n },
    });
    const p = check(v, 'parameters_match_chain_policy');
    assert.equal(p.ok, false);
    assert.match(p.detail, /chain policy in force at the anchor: v3, rate 1000 bps, max 5/);
    assert.match(p.detail, /record names v1, rate 2500 bps, max 10/);
  });
});

describe('round-3 follow-up: digest and winners shape are checked up front', () => {
  const recordWith = (mutate) => {
    const r = JSON.parse(JSON.stringify(RECORD));
    mutate(r);
    return { ...INPUT, record: r };
  };
  it('a non-string selected_draw_ids_hash is refused at the shape check, before re-derivation', () => {
    const v = verifyDraw(recordWith((r) => { r.selected_draw_ids_hash = null; }));
    assert.equal(v.result, 'mismatch');
    assert.equal(v.checks.find((c) => c.name === 'record_shape').ok, false);
    assert.equal(v.checks.find((c) => c.name === 'winners_redrawn'), undefined);
  });
  it('winners that is not an array is malformed', () => {
    const v = verifyDraw(recordWith((r) => { r.winners = 'x'; }));
    assert.equal(v.result, 'mismatch');
    assert.match(v.checks.find((c) => c.name === 'record_shape').detail, /winners is not an array/);
  });
  it('the golden record still verifies', () => {
    assert.equal(verifyDraw(INPUT).result, 'verified');
  });
});
