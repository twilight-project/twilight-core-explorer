import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { verifyDraw, winnerCount } from '../dist/lib/draw-verify.js';

// GOLDEN VECTOR: the real slot-3 epoch-1657 draw record published by rewards.nyks.dev
// (the first real draw on twilight-testnet-1) plus the 24 beacon-window blocks exactly as
// this explorer indexed them (block-id hash + attributed proposer slot). A faithful port of
// twilight-minis internal/selectionv1 must reproduce every digest in the record.
const RECORD = {"k": 1, "anchor": {"tx_hash": "1f638f348f53a8301aaac4e4273c4d79015919f2fee72bc630fb98bdd3593ee6", "confirmed_height": 597022, "committed_set_hash": "9539cac0508da4c9e83079053cadd2f88392724c44856351048f8a41f987926f", "committed_params_hash": "36c8ee0e661da9a90194bbb105c14e644d717ef83831c1b7fa3c8b5402e1e89c"}, "beacon": {"hash": "c8a42a9417010c5235d26a471b1f50b3008be2ed7c141a4171c02f88b6df5af5", "admissible": true, "end_height": 597093, "start_height": 597070, "usable_blocks": 18, "unattributable_blocks": 0, "excluded_target_blocks": 6, "distinct_external_proposers": 3}, "outcome": "SUCCESS", "slot_id": 3, "version": 1, "winners": ["e544b4b79969d1be15a1d32a226a5b6a56d07feabd4d26f1e2317aa37fbcdf84"], "chain_id": "twilight-testnet-1", "candidates": ["11a30b208290072dab2411295bdc92ef02aa32bf57ccda03efcdd89913f98c0e", "e544b4b79969d1be15a1d32a226a5b6a56d07feabd4d26f1e2317aa37fbcdf84"], "parameters": {"selection_rate_bps": 2500, "beacon_window_blocks": 24, "selection_params_version": 1, "selection_policy_version": 1, "max_selected_participants": 10, "beacon_start_offset_blocks": 48, "min_external_beacon_blocks": 12, "max_candidates_per_selection": 1024, "exclude_target_slot_proposals": true, "min_distinct_external_proposers": 3, "chain_min_external_beacon_blocks": 12, "chain_min_distinct_external_proposers": 3, "max_selected_participants_per_selection": 64}, "target_epoch": 1657, "candidate_set_hash": "9539cac0508da4c9e83079053cadd2f88392724c44856351048f8a41f987926f", "selected_draw_ids_hash": "fe1ee23fbb4524f20ee36d9bb52ded7e812caf2626ae608eca68d55782802b82"};
const BLOCKS = [{"height": "597070", "hash": "D03CAAC083DBD9806AAF749BD919B2C71C0D3CE6D9BB23BB1AD1FE1EF6B66939", "proposerSlotId": "4"}, {"height": "597071", "hash": "9352C5328F5F571F2D120EBD52CEA2419A718790090C8E10FB8D0CF4A9EFE84E", "proposerSlotId": "3"}, {"height": "597072", "hash": "D26D3B81F1CC8FD92764E4CCB35211250E1304D1C5D9A8C3FB9B6452654541F9", "proposerSlotId": "1"}, {"height": "597073", "hash": "F4FB6F3BEF627CC745FD89716C2004A2C9853E76FFBF91EFDED5ABEF0FD66020", "proposerSlotId": "2"}, {"height": "597074", "hash": "5203F2650110F1413C64FB86A30C2174D0372985137B6325BC1BAC73346ACE17", "proposerSlotId": "4"}, {"height": "597075", "hash": "BEE9698C02874A86CAB51BB919D895F098D547E933F2F4ECA28416E4AE6921B6", "proposerSlotId": "3"}, {"height": "597076", "hash": "42344A825CBFF9EEBDF1248AF95A20F19A11FCC280B2312DAC4B88A9B6582FDA", "proposerSlotId": "1"}, {"height": "597077", "hash": "753E66267796582CF3710643675B3169ECE9B2BEFF9D64D42CC987840B9D953C", "proposerSlotId": "2"}, {"height": "597078", "hash": "5914ADF8C5CD56664A32C846213DB41FA49251583560B791DCB785F1FFA52A03", "proposerSlotId": "4"}, {"height": "597079", "hash": "7639B446C81940EBC4B5A5909A0CD40A7572ACB7066821F4CFE70D73D344756A", "proposerSlotId": "3"}, {"height": "597080", "hash": "A70DFCA4CA04BE855F00EDC88BAF4EA581A807B298CF6F735F2DC4E4A8030AD7", "proposerSlotId": "1"}, {"height": "597081", "hash": "A78A11CC331EC5EF2AB9205B87B1983937F18508EA2C19C4FCEF628848E83CDC", "proposerSlotId": "2"}, {"height": "597082", "hash": "6D2D8837A14CE8D6E5ABC8A74F3B3C72CD8DDFC155E92DF04EB7377A4617FA31", "proposerSlotId": "4"}, {"height": "597083", "hash": "201A1625D749AC5AD089FEEB8222237638A6BF8E412F8A80D049D439A32637CD", "proposerSlotId": "3"}, {"height": "597084", "hash": "974AFBEC6DFA7DA9C1A70404916FD4F177FBC6B8D6541AD867DE4353420925E8", "proposerSlotId": "1"}, {"height": "597085", "hash": "5B52494D678B6D1EEB140DB26DEB4CDCEADDD14F497260FA086392B54F1F1667", "proposerSlotId": "2"}, {"height": "597086", "hash": "D9E51D95459D10B1D5C900101E94DD9E83C384E96D63485A94C03DCC28C2D9FB", "proposerSlotId": "4"}, {"height": "597087", "hash": "0CBEAB28E2FA663E0766062FEF8AC5E00F89761A35157A8F01FEC6D0E6D99CCC", "proposerSlotId": "3"}, {"height": "597088", "hash": "309253F0CBF8AA81200EBDA6341F788F5D591E42C0357AE7A941548D17022343", "proposerSlotId": "1"}, {"height": "597089", "hash": "A6F2A69698BA44062E4AC9C118C40CE771B66A2D580849C81D067DF331602273", "proposerSlotId": "2"}, {"height": "597090", "hash": "57860DD778F7C19B8340D63D2D708261075E39AB82D33B36D32311055F7FCA77", "proposerSlotId": "4"}, {"height": "597091", "hash": "0D0A2B9F7688CA42D0F9869ADAC6A2B51889D2CF2CF03979BBCF64FCFA9ACBE6", "proposerSlotId": "3"}, {"height": "597092", "hash": "1DEE47EAEC7148B19AB18FD0A5AF4B0BF2557FFA090C02BDBE60A95510A8CC07", "proposerSlotId": "1"}, {"height": "597093", "hash": "3CCA1D42B907C5D088CF0EF2F28AEFEEF61691D1E2392E0A0639439B34BBC717", "proposerSlotId": "2"}].map((b) => ({
  height: BigInt(b.height), hash: b.hash,
  proposerSlotId: b.proposerSlotId === null ? null : BigInt(b.proposerSlotId),
}));
const ANCHOR = {
  memo: JSON.stringify({ v: 1, slot: 3, epoch: 1657, set: RECORD.candidate_set_hash, params: RECORD.anchor.committed_params_hash }),
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

  it('a tampered candidate list breaks the set hash AND the anchor commitment', () => {
    const forged = JSON.parse(JSON.stringify(RECORD));
    forged.candidates = [...forged.candidates].reverse();
    const v = verifyDraw({ ...INPUT, record: forged });
    assert.equal(v.checks.find((c) => c.name === 'candidate_set_hash').ok, false);
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
