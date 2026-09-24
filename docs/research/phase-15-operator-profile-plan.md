# Twilight Core Explorer Phase 15 — The Operator Profile: What a Prospective Participant Must See

**Status:** handover plan, 2026-09-11. Written by the architecture owner for the explorer team.
Builds on `phase-14-participant-surface-plan.md` (the participant surface, provenance model,
states vocabulary) and does not reopen anything decided there.

**Sources, all current as of this date.** Chain canon `twilight-chain-mining-architecture-v2.2.md`
(§4, §14, §17, §19, §24, §26–27, §53, §55–56, §59); the payout specification
`TWILIGHT_MINIS_ALLOCATION_SETTLEMENT_V1_4` (§5, §27, §27.1, §47); the draw profile
`twilight-minis-as-draw-profile-v1.md` (draft) and `twilight-minis/docs/verifying-a-draw.md`; the
operator-status contract `TWILIGHT_OPERATOR_STATUS_V1_DRAFT_0_3`; `ADR-MINIS-0010`, `ADR-MINIS-0015`,
`ADR-MINIS-0020`; `ESC-031`; the AS ↔ client contract §18.1 and §19; the gate records in
`twilight-minis/docs/gates/`; the agent-onboarding design
`search-platform-agent-onboarding-design.md`; and this repository's Prisma schema, API routes
and `apps/web/src/components/operator/`. Where a source is a draft it is named as one.

---

## 1. Why this page exists

An operator will hand a prospective participant a link and say "mine with us". The page at
the other end of that link has one job: let a stranger decide, from public facts, whether this
operator is real, whether it actually pays, and what they would be signing up for. The chain
already has a page per CoreSlot and an operator page that names the addresses and embeds the slot
detail. Neither answers those three questions in the order a newcomer asks them, and neither
separates what the chain proves from what the operator merely says.

Three things about this system shape the page, and every section below follows from them.

**The chain fixes what a slot earns; the operator decides who gets it.** Canon §4: off-chain
activity may redistribute a slot's fixed entitlement and never increases it. Canon §14: in
`TRUSTED_AS_DISTRIBUTION`, which every testnet target is, the chain does not store, validate or
certify the operator's distribution policy; it pays whatever structurally valid addresses the
operator's settlement chunks name, up to the entitlement, and sends the undistributed remainder
to the operator's own payout address at finalization. Canon §53 requires this limitation to be
explicit in user-facing documentation. So the page cannot claim the chain guarantees fairness.
What it can do is show, per epoch, that what the operator says it did matches what the chain
paid, and label every figure by which of the two it came from.

**No per-address status is ever public.** `ADR-MINIS-0020`: the join between a participant and
an unpaid address is not published. A participant reads their own history through their own
client, authenticated. The page shows aggregates and chain facts only. It never says "this
address was excluded because…".

**The operator's own words are theirs.** A name, a description, a contact are things an
operator declares. The page renders them, in a box marked as declared, and never verifies them.

---

## 2. The three questions, and the verdict

The page is ordered by the questions a newcomer asks, and each section answers one:

1. **Who is this?** Identity on chain, the declared profile, and independent standing.
2. **Do they actually pay?** The track record, the rules they apply, why people were not paid,
   and the lottery when there is one.
3. **What am I signing up for?** Enrollment now, the clock, the operator's commitments, how to
   join.

Above all of it, one verdict line, computed, in the same verdict-first style the Overview uses,
with its provenance label. The shape:

```text
Settled 47 of 47 epochs · median 210 blocks after close · 2,104,300 TWLT paid to 31 participants
in the last 30 days · 0.4% kept as remainder                                   [chain]
```

The four figures that produce it are §6.1–§6.4 below, all chain facts. There is no trust score.
The verdict is the score, and any visitor can recompute it from indexed events.

---

## 3. Provenance — the same three labels, applied strictly

Phase 14 §7.3 defined the labels. This page uses them on every figure and every sentence:

| label | meaning here | examples on this page |
|---|---|---|
| **chain** | fact from an indexed event or snapshot | registration, status, settlement finalizations, payouts, remainder, key rotations, liveness, selection policy |
| **verified** | operator-published and matching a chain commitment | an epoch's stated share equal to the chain's payout; counts that reconcile; a draw record the explorer re-derived; the sealed allocation hash when the chain carries it |
| **attested** | operator-published, no commitment | the clock, the aggregates for an open epoch, `settlement_expected_by`, the reason counts |
| **declared** | the operator's own words from its on-chain metadata | name, description, website, contact |

**declared** is new in this phase. It is not a fourth provenance of data; it is the label for
free text the operator controls, and its only rule is that it is always rendered inside a marked
box and never inline with a chain figure.

---

## 4. Placement

**Route.** The existing `/operator/[address]` page becomes this. It already resolves an address to
its CoreSlot by operator, consensus or payout role, names it from the `moniker` in slot metadata,
and embeds `CoreSlotDetail` with its Overview · Signing · Rewards · History · Raw tabs. Keep the
resolution and the embed; replace the thin card above the embed with the sections of §5, and
make the embed the "Full slot detail" section at the bottom rather than the page. Add an alias
`/operators/[slotId]` so an operator can hand out a link by slot number, which is what they know.

**Directory.** A new `/operators` list, reached from the Validators destination as a tab beside
the registry (phase 14 §3.1 keeps four destinations; this is a tab, not a fifth). One row per
slot: name, status, the four verdict figures, publishes-status yes/no, last successful feed fetch
and its age. Phase 14c's "Operators page with per-slot health" is this list; the health columns
are the ones it named.

**Links in.** The CoreSlot page's header links to the profile ("Operator profile →"). The
settlement detail page links to the profile of the settling slot. The account page's rewards
section links each paying slot to its profile. The "mine with us" deep link is `/operators/3`.

**The Overview is untouched.** Nothing from this page is promoted to the Overview beyond what
phase 14 already placed there.

---

## 5. The page, section by section

Every field names its provenance and its source. Sources are this repository's models unless
stated; "feed" means the operator-status contract reads; "metadata" means the slot's on-chain
metadata field.

### 5.1 Verdict

| field | provenance | source |
|---|---|---|
| epochs settled / epochs owed | chain | §6.1 |
| median and p90 settlement latency, current open settlement and how late | chain | §6.2 |
| paid to participants, kept as remainder, ratio, over a 30-day and an all-time window | chain | §6.3 |
| participants paid per epoch, trend | chain | §6.4 |

### 5.2 Who they are — identity on chain

| field | provenance | source |
|---|---|---|
| slot id, status (`PENDING` `ACTIVE` `INACTIVE` `SUSPENDED` `REMOVED`), registered at height and date, activated at | chain | `CoreSlotProjection.slotId/status/createdHeight/activationEffectiveHeight`, `CoreSlotLifecycleEvent` |
| operator address, consensus address, consensus power | chain | `CoreSlotProjection` |
| payout address (where the remainder goes), settlement address (what signs settlements), with change history | chain | `CoreSlotProjection.payoutAddress/settlementAddress`, `CoreSlotPayoutChange`, `CoreSlotSettlementAddressChange` |
| consensus key rotations, each with requested, effective, applied or cancelled heights | chain | `CoreSlotConsensusKeyRotation` |
| liveness as a chain operator: blocks proposed, signed, missed, current health | chain | `CoreSlotLivenessSummary`, `CoreSlotHealthSnapshot`, `BlockProposerAttribution`, `OperatorSigningEvidence` |
| selection policy in force: `selection_rate_bps`, `max_selected_participants`, version, effective height | chain | `CoreSlotSelectionPolicyChange`, `CoreSlotProjection.currentSelectionPolicyVersion` |

Caption the registration line with the fact that matters to a newcomer: registration is
authority-controlled (canon §19; there is no self-registration), so an operator on this list was
admitted by the chain's authority, not by paying a fee. Caption the settlement address with
`ADR-MINIS-0010`: the reference implementation requires a dedicated settlement account that the
operator does not otherwise transact with; the explorer can show whether that address has ever
sent anything other than settlement messages, as a chain fact, and label a violation plainly.

### 5.3 Who they are — declared profile

| field | provenance | source |
|---|---|---|
| name | declared | metadata `moniker` (already promoted by `operator-metadata.ts`) |
| description, website, contact, security contact, jurisdiction or legal entity | declared | metadata keys to be agreed with the chain team (§8.1); until then they arrive in `extras` and render as raw JSON |
| service offered | declared | metadata, or the AS service document's `source_profiles` (`SEARCH_ROUTER_V1`, `OPENROUTER_V1` on the live slot 3 AS) rendered as "search router" and "OpenRouter" |
| last metadata change, with height and transaction | chain | `CoreSlotMetadataChange` |

Rules: always in a marked box titled "Declared by the operator"; never verified; URLs rendered as
plain text with an external-link affordance, never auto-opened; the metadata byte bound is the
chain's (`HARD_MAX_CORE_SLOT_METADATA_BYTES`), so no field is truncated by the explorer, only
scrolled.

### 5.4 Who they are — independent standing

| field | provenance | source |
|---|---|---|
| publishes operator status: yes / no; last successful fetch and age; retention window advertised | attested (the fact that it publishes is the explorer's own observation) | feed discovery document, per slot |
| draw record published: yes / no; last draw the explorer could verify, with outcome | verified when re-derived, else attested | the AS's candidate-list route, `verifying-a-draw.md` |
| AS reachable and its service document valid | explorer observation | `GET {authorization_server}/.well-known/twilight-mining` |
| gates this operator's AS passed, by record name and date | chain-independent citation, shown as "recorded by the operator's repository" | `twilight-minis/docs/gates/`: `POC1-GATE` (graded run 2026-09-06), `DRAW-GATE` (2026-08-30), `SEARCH_ROUTER_USER_ATTRIBUTION` (2026-08-26), `openrouter-account-isolation` (2026-09-02) |

The gate list is a configured per-slot fact for now, since nothing on chain carries it; render
it with the explicit caption that these are records in the operator's own repository, linked,
and not something the explorer verified. If that caption cannot be honoured in the design, leave
the row out rather than show a badge.

### 5.5 Do they pay — the rules they apply

| field | provenance | source |
|---|---|---|
| distribution mode: `TRUSTED_AS_DISTRIBUTION` | chain | `RewardEpochProjection.distributionMethod` |
| allocation rule: `equal` (policy `TRUSTED_EQUAL_ELIGIBLE_V1_POC`) | attested, verified per epoch | feed `share.rule`; payout §27 |
| the floor: no share is paid below `min_recipient_payout_amount` | chain | settlement parameters (`RewardsParamsChange.paramsJson`) |
| the ceiling: `K_max = min(M × C, ⌊budget / floor⌋)` where `M` and `C` are the chain's chunk limits | chain, derived | settlement parameters; payout §27 step 4 |
| admission order when eligible exceeds the ceiling: earliest accepted enrollment first | rule, cited | payout §27.1, an accepted POC-1 limitation, quoted as such |
| the share: `budget / K_admitted`, integer division, residue to remainder | attested per epoch, verified against payouts | feed `share.amount`, `MiningSettlementPayout.amount` |
| what happens to the rest: remainder to the operator's payout address at finalization | chain | canon §14, `MiningSettlementFinalization.releasedRemainder` |

Write these as five sentences a newcomer can read, with the formula beside each. One of them is
the sentence canon §53 requires: *the chain does not check that the operator followed this rule;
the explorer checks it for every settled epoch, and the result is the "verified" mark on each
row of §5.7.*

### 5.6 Do they pay — the track record

The verdict's four figures, expanded into a table of the last N epochs (N from the feed's
`retention_epochs`, default 90) with one row per epoch owed:

| column | provenance | source |
|---|---|---|
| epoch, close height, close time | chain | `RewardEpochProjection` |
| entitlement | chain | `SlotEntitlementProjection.entitlementAmount` |
| paid to participants, number of recipients, number of chunks | chain | `MiningSettlementChunk`, `MiningSettlementPayout` |
| remainder to operator, finalization reason, finalized height, latency in blocks | chain | `MiningSettlementFinalization` |
| state: `paid` `open` `late` `remainder` `not settled` (phase 14 §8) | chain | derived as phase 14 §6.3 |
| operator's stated share and admitted count, with the verified/mismatch mark | attested → verified | feed `share`, `counts.admitted`; §6.5 |

A settlement past the chain's deadline that was finalized permissionlessly (canon §24, §59:
after the deadline anyone may finalize and the remainder can only go to the snapshotted payout
address) is shown as `remainder` with the reason, because a participant reading it needs to know
the operator did not settle in time and the chain closed the epoch for them.

### 5.7 Do they pay — why people were not paid

Per epoch, from the feed, aggregates only:

| field | provenance | source |
|---|---|---|
| enrolled, eligible, admitted | attested; verified once sealed if the counts reconcile (§6.5) | feed `counts` |
| not eligible, per reason: `NO_ACCEPTED_ENROLLMENT` `PARTICIPATION_NOT_AUTHORIZED` `NO_VERIFIED_ACTIVITY` `NO_VALID_PAYOUT_DESTINATION` | attested | feed `counts.not_eligible` |
| excluded, per reason: `NO_VALID_PAYOUT_DESTINATION` `EXCLUDED_BELOW_FLOOR` `EVIDENCE_VERIFIED_AFTER_SEAL` `NOT_SELECTED_IN_DRAW` `NOT_SELECTED_NO_VALID_BEACON` | attested | feed `counts.excluded` |

Captions are fixed per identifier and say what happened, not who was at fault, which is the
rule the AS itself follows in naming them: "not enrolled in time", "not authorized to
participate", "no verified search activity in the epoch", "no valid payout address on file",
"admitting more would have pushed every share below the chain's floor", "evidence verified only
after the epoch was sealed", "not selected in the draw", "the draw's beacon was invalid, so nobody
was selected". An identifier the explorer does not know is shown as itself, never folded. Under
the table, the sentence the design fixes: *your own epochs are in your client:
`dropin-miner status`.*

### 5.8 Do they pay — the lottery

Shown only for epochs whose exclusions include `NOT_SELECTED_IN_DRAW` or
`NOT_SELECTED_NO_VALID_BEACON`, or where the feed's discovery document names a `draw_record`:

| field | provenance | source |
|---|---|---|
| the anchor transaction, its memo digests (`set`, `params`), confirmed height | chain | the anchor is an ordinary transaction from the settlement address; index it by memo shape |
| beacon window start and end, the block hashes in it | chain | blocks |
| candidate count, winner count `K`, outcome (`SUCCESS` `NO_CANDIDATES` `NO_VALID_BEACON`) | attested | the AS's published record at `candidate_list_endpoint_template` |
| explorer verification: re-derived `K` and ranking match the record | verified / mismatch | the procedure in `verifying-a-draw.md`; canon §16 for `K` from the slot's selection policy |

This is the one place the page can show something stronger than "the chain paid what the
operator said": that the operator could not have chosen the winners. The explorer does the
recomputation itself; it does not trust the operator's `drawverify` output. If the explorer
cannot re-derive, the row is attested, never verified.

### 5.9 What you sign up for — enrollment now and the clock

| field | provenance | source |
|---|---|---|
| current epoch, state (`OPEN` `FROZEN` `ALLOCATION_SEALED` `SETTLEMENT_RECONCILED` `NO_TARGET_EPOCH`), start and close heights, close time | attested, with age | feed `clock.current_target` |
| observation deadline, reconciliation deadline, settlement expected by, each with `estimated` shown | attested | feed `clock.current_target.*_deadline`, `settlement_expected_by` captioned "the operator's own policy figure, not a promise" |
| enrollment mode and whether trusted joining is open; `trusted_join_closes_at` or "not set" | attested | feed `clock.enrollment` |
| enrolled now against the ceiling `K_max` for the open epoch | attested | feed `counts.enrolled` for the open epoch, ceiling from §5.5 |
| previous epoch and its state | attested | feed `clock.previous_target` |

Fallback when the feed is absent or stale: the phase 14 §6.2 estimate, labelled `estimate`, and
the sentence "this operator publishes no status" where the feed fields would be. Never a blank.

### 5.10 What you sign up for — the operator's commitments

| field | provenance | source |
|---|---|---|
| publishes a sealed allocation hash per epoch (`TWILIGHT_MINIS_ALLOCATION_RESULT_HASH_V1`, `ADR-MINIS-0015`) | attested; verified per epoch when the chain carries the commitment (§8.3) | feed discovery `commitments.allocation_result_hash`, feed `allocation_result_hash` |
| history served for at least `retention_epochs` (contract floor 90) | attested | feed discovery |
| rate limits committed to | attested | feed discovery `rate_limit` |
| payout-address changes need the operator's activation; first binding self-activates (`ESC-031`); count of changes pending and median time to activate | attested aggregate | the operator status feed does not carry this today; see §8.4 |

### 5.11 What you sign up for — how to join

Static, from the onboarding design, and the same on every profile:

- one install line per platform, from the client's README;
- `dropin-miner connect` registers the agent and prints one claim link; search works
  immediately at the unclaimed tier; one visit to the claim page is the only human step;
- mining is opt-in and asked once at the terminal; the claim page grants it;
- payout goes to an address the participant controls, declared by the client; the explorer only
  ever links an address to a person if that person does;
- the operator's slot number, so `[mining] slot_id` in the client's config can be checked.

### 5.12 Full slot detail

The existing `CoreSlotDetail` embed, unchanged, as the last section.

---

## 6. The computations, defined exactly

Every figure in the verdict has one definition, so two readers cannot get two numbers.

**6.1 Epochs settled / owed.** Owed: every epoch with a `SlotEntitlementProjection` row for the
slot whose `entitlementAmount > 0`. Settled: owed epochs with a `MiningSettlementFinalization` row.
Both windows: the last 30 days by epoch close time, and all time. An epoch with an entitlement and
no finalization whose deadline has passed is counted as not settled, permanently; the deadline is
derived as phase 14 §6.3 derives "late".

**6.2 Latency.** `finalizedHeight − RewardEpochProjection.height` of the epoch's close, per settled
epoch; median and p90 over the window. The open settlement, if any: current height minus close
height, shown beside the slot's own p90 so "late" has a reference.

**6.3 Paid versus kept.** Paid: sum of `MiningSettlementPayout.amount` for the slot in the window.
Kept: sum of `MiningSettlementFinalization.releasedRemainder`. Entitlement: sum of
`entitlementAmount` for the same epochs. Show all three and the ratio `kept / entitlement`. A
remainder that exists only because integer division left a residue is normal and small; a
remainder equal to the entitlement is an epoch nobody was paid for, and the finalization reason
says why.

**6.4 Participants paid per epoch.** Distinct `MiningSettlementPayout.recipient` per epoch. Shown
as a small trend, not a single number, because the direction is the fact.

**6.5 Verification of an operator's epoch.** For a settled epoch with a feed row:
`share.amount` equals every `MiningSettlementPayout.amount` for the epoch, and
`counts.admitted` equals the distinct recipient count, and
`enrolled = eligible + Σ not_eligible` and `eligible = admitted + Σ excluded` (contract §6.3).
All four hold: **verified**. Any fails: the chain's numbers are shown, the operator's beside them
struck through, and the row labelled "operator's figures do not match the chain", which is the
contract's own instruction (§6.4). The explorer does not decide who is right; the chain is.

**6.6 The declared-versus-observed settlement account.** Every transaction from
`settlementAddress` that is not a settlement chunk, a finalization, or a draw anchor, counted
and listed. Zero is the expected value under `ADR-MINIS-0010`.

---

## 7. What must not appear

- No per-address status, reason or history, from any source. The account page shows chain
  payouts to an address; this page never joins an address to an operator's reason.
- No user identifiers, installation ids, request ids, query text, provider names per
  participant, usage counts per participant. The feed is built not to carry them and a test on
  the explorer's side refuses them if one ever appears.
- No operator free text rendered as fact. `moniker` and any future declared field are always in
  the declared box.
- No trust score, rating, rank or badge computed by the explorer. The verdict figures are the
  whole of the explorer's opinion.
- No promise language. `settlement_expected_by` is captioned as the operator's policy figure;
  "usually within N blocks" is the observed p90, not a guarantee.
- No claim that the chain certifies fairness. The canon §53 sentence appears once, in §5.5, in
  plain words.

---

## 8. What other teams must add, and what to do until they do

**8.1 Declared profile fields (chain team, then operators).** Slot metadata today carries
`moniker` on some slots and nothing on others. The page needs an agreed key set:
`moniker`, `description`, `website`, `contact`, `security_contact`, `entity`, `service`. The
chain's byte bound on metadata already exists; the agreement is on names only, and
`operator-metadata.ts` promotes a key by adding one line. Until agreed, unknown keys render from
`extras` as raw JSON inside the declared box, which is honest and ugly, and the page should ship
that way rather than wait.

**8.2 The service document (chain team, slot operator).** The AS ↔ client contract §18.1 puts a
`twilight-slot-services-v1` document in slot metadata naming `authorization_server`; the
operator-status contract §3 adds `operator_status` to it. Until the slot-3 metadata carries it,
both base URLs come from per-slot explorer configuration, labelled "configured", and discovery
from the chain is the acceptance condition for phase 15c. The live slot-3 AS is
`https://rewards.nyks.dev`; its `.well-known/twilight-mining` answers today, and its
operator-status reads did not as of this date, so §5.4, §5.7, §5.9 and §5.10 build against the
contract's shapes and switch on when the feed answers.

**8.3 A commitment for the allocation hash (chain team).** The operator publishes
`allocation_result_hash` per epoch. Nothing on chain carries it, so it can only be recorded and
verified retroactively. If settlement finalization ever carries the hash, §5.10's row and the
`counts` of §5.7 become verifiable. Phase 14 §7.3 asked the same question; this is a second use.

**8.4 Payout-change aggregates (minis team).** The operator-status feed carries no count of
pending payout-address changes or activation latency; per-participant binding state is
authenticated by design. An aggregate read ("changes pending: 2, median activation 3h") is
additive under contract §9 and is the one item on this page that needs a feed change. Until
then §5.10's last row reads "not published".

**8.5 Draw anchors (explorer, no one else).** The anchor is an ordinary transaction with a memo;
indexing it needs no upstream change. The candidate record is public at the AS. The
verification procedure is documented. Everything in §5.8 is buildable now for the epochs that
ran a draw.

---

## 9. States and empty cases

Every section renders one of the phase 14 §8 states or one of these, never a blank:

```text
declared        the operator's own words, unverified
configured      a base URL or gate list that came from explorer configuration, not the chain
not published   the operator's feed exists but does not serve this read or field
no status       the operator publishes no status feed at all
no draw         this epoch's admission did not run a draw
mismatch        the operator's figure does not match the chain's; the chain's is shown
```

A slot with no feed, no metadata and no settlements still has a complete page: identity from
the chain, "no status", "declared: nothing", and a track record table with one row per owed
epoch, each `open`, `late` or `not settled`. That page is a true statement about that operator.

---

## 10. Phases and acceptance

**15a — chain-only, no upstream dependency.** The route and alias; the `/operators` list; §5.1
verdict with §6.1–§6.4; §5.2 identity; §5.3 with `moniker` promoted and `extras` raw; §5.5 rules
from chain parameters and cited text; §5.6 track record; §6.6 settlement-account check; §5.8
anchors indexed and draws re-derived for epochs that had one; §5.11 static; §5.12 embed; the §7
refusal test.
*Accept when:* every §5.1, §5.2, §5.5, §5.6 field renders from indexed data with the `chain`
label; the verdict recomputes from the table on the same page; a slot with no settlements shows
`not settled` per owed epoch; the declared box shows raw extras; a draw epoch shows the anchor
and the re-derived outcome; the privacy test is red if an address appears in any operator-side
row.

**15b — feed-dependent.** §5.4 standing, §5.7 reasons, §5.9 clock and enrollment, §5.10
commitments, §6.5 verification marks on the track-record rows; the `/operators` list health
columns. Builds against contract shapes and a fixture until the live reads answer.
*Accept when:* a settled epoch shows `verified` when the four checks hold and `mismatch` with
the chain's numbers when one fails, proven by a fixture that breaks each check; the clock shows
its age and falls back to `estimate` when stale; a slot with no feed shows `no status` in every
feed-sourced row and nothing else changes.

**15c — as the owners deliver.** Declared fields promoted as the chain team agrees names; base
URLs discovered from the service document instead of configuration; the allocation hash
verified if the chain carries it; the payout-change aggregate if the feed adds it.
*Accept when:* the `configured` state no longer appears on slot 3.

---

## 11. Open questions, by owner

- **Chain team:** the declared metadata key set (§8.1); whether the service document lands in slot
  metadata in the shape contract §18.1 shows (§8.2); whether finalization can carry the
  allocation hash (§8.3).
- **Minis team:** an aggregate payout-change read on the feed (§8.4); publishing the slot-3
  operator-status reads on the live AS.
- **Slot 3 operator:** the metadata update with the declared profile once the keys are agreed;
  the service-document broadcast.
- **Explorer team:** whether the `/operators` list belongs under Validators as a tab or as a
  section of Economy; the architecture side has no preference beyond "not a fifth destination".
- **Architecture:** ratification of the exclusion-reason spellings, which the AS code itself
  marks provisional; the explorer's captions should be the only place a reader sees a
  translation, so a respelling costs one map.
