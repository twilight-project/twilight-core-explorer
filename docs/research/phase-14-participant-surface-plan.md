# Twilight Core Explorer Phase 14 — The Participant Surface: Design, Placement, and Data

**Status:** handover, 2026-09-09. Authored by the architecture side; owned by the explorer team
once accepted. Builds on `new-design` at `7c12243`, on the old-vs-new comparison report, and on the
six-item schema evaluation the team produced against the indexer. Nothing here reopens the
information architecture the redesign settled; it adds the persona the redesign did not have, and
gives back the one thing the old design did better.

**One-line summary:** keep the new skeleton (four destinations, tabs, lazy loading, one number
once), give the Overview a second, denser view for the operator who monitors continuously, and
build the participant's door: an address in, a payout explained, every figure labelled with where
it came from.

---

## 1. Why this phase exists

The chain exists to pay people. A block browser is the wrong shape for that; the right shape is an
audit trail: *who was paid, for which epoch, under which slot, why that amount, and can I check it
myself.* The unit of navigation is the epoch and the slot; blocks and transactions are the evidence
one click deeper.

The redesign built that for one persona, the operator CLAUDE.md names ("is my CoreSlot active and
signing, what is the halt risk"), and it did so well: no number appears twice, pages fetch only what
is looked at, a verdict comes before the instrument panel. It has no door for the second persona:
the **participant**, a person or an agent's owner with an address, asking "was I paid, when is the
next one, and if not, why not." The data for that persona is already indexed. Its placement says it
is an afterthought.

Two rules govern everything below.

```text
The chain is the only source of fact.
Everything else is explanation, labelled with its source.
```

```text
Late and missing are states, never absences.
An empty cell is the worst answer a rewards product can give.
```

## 2. Personas and what each must be able to answer

**Operator or monitor** (existing, unchanged): is my slot signing, what is the halt risk and why,
did my slot settle its last epoch on time, how much did it distribute versus retain, what is the
escrow holding, how many participants am I carrying, who else is running.

**Participant** (new): which epochs paid this address and how much; why that amount; when the
current epoch closes and when settlement usually lands; whether a payment is late; and — once the
operator-status source exists (§8) — from their own client, not the explorer — whether an epoch that did not pay was "not enrolled", "not
verified", or "deadline missed".

**Newcomer** (either persona on a first visit): a one-line answer about the network before any
panel, and a description line under each page title.

## 3. Information architecture — what stays, what changes

### 3.1 Stays

- Four destinations: Overview · Validators · Economy · Explorer. The participant enters through
  an address, not through a fifth destination.
- Tabs on Validators, Economy, and every detail page; only the active tab mounts.
- "Each metric appears exactly once per page."
- Compact spacing as the fixed baseline. No spacing toggle returns.
- Dark and Light as the two shipped themes, with the pre-paint migration of stored ids.

### 3.2 Changes

**Overview gets two views, persisted per browser (`localStorage`, key `overview.view`):**

| view | who | what |
|---|---|---|
| **Glance** (default, and the first-visit default) | newcomer, participant, quick check | verdict sentence, the address door (§4.1), three stat doors, two activity panels — the page as it is today, plus §4.1 |
| **Dashboard** | the continuous monitor | the old KPI grid, freshness strip, liveness bar and supply panel, **deduplicated** (index lag once), over the same hooks the redesign already calls; the components largely still exist in the tree |

Dashboard is a choice the visitor makes once; its extra queries are the cost of that choice. The
toggle sits at the right of the verdict line, "Glance · Dashboard", never in the header.

**Page description lines return.** `DetailShell` already takes `description`; every destination
page and every detail page gets its one-line subtitle back. The old paragraphs helped newcomers;
one line keeps that without the weight.

**A third theme, restored from the old default, if it is the one the product owner preferred.**
Themes are CSS-variable blocks (`globals.css`); adding one is values, not code. Three is not the
maintenance burden five was.

**Typography, one fix:** the dark theme repoints `--font-serif` to Inter while light uses the
Instrument serif, so the product's identity changes with the toggle. Keep the serif display face in
both modes. Everything else in the token set stays.

## 4. Placement, page by page

### 4.1 Overview

- **Verdict sentence** gains two things. First, `risk.haltRiskReason` — the plain-English reason
  behind a halt-risk level, dropped in the redesign; it goes into the clause that names the level.
  Second, once the clock projector lands (§6.2), the current epoch and its close: "Epoch 341 closes
  in ~2h 10m (est.); 1 settlement open." Until then the estimate form of §6.2, labelled.
- **The address door.** Directly under the verdict, one input: *"Check rewards for an address"*,
  submitting to `/accounts/{address}`. The header search already resolves addresses; this states the
  intent on the one page a participant lands on. It is the pivot, made visible.
- **Stat doors.** Replace "Average block time → Blocks" (weak, and already on Blocks) with
  **"Current epoch closes in → Economy"** once the clock exists; until then **"Open settlements →
  Economy"**, which §6.3 makes available now.
- **Dashboard view** as in §3.2.

### 4.2 Account (`/accounts/[address]`) — the participant's home

Reorder to rewards first:

1. **Rewards received** (moves to the top). Each row: amount, slot, epoch, height, tx — plus the
   **split line** from §6.1: *"entitlement X, split across K recipients, this address received Y"*,
   and a link to the settlement (`/mining/settlements/{slotId}/{epoch}`). The header stat cards stay.
2. **Identity** (address, kind, first/last seen, tx count).
3. **Sampled balances.**
4. Raw.

**States, not blanks.** No payouts at all: *"No settlement has paid this address."* An epoch in
the participant's history with no payout, once §8's source exists: the epoch's aggregate and a pointer to the client's own `status`. Never the
bare empty-table string.

**The "Reward entitlements → search" link** stays, reworded *"Entitlements paying this address"*;
per-address enrolled/excluded states are the participant's own, in their client (§7.3), and never
appear here.

### 4.3 Economy

- **New Settlements tab:** per epoch, every slot expected to settle (entitlement exists) against
  every slot that did (a finalization row): settled / open / late, with "how late" as current
  height minus the epoch's close height (§6.3). Late is a state and a colour, and it also becomes a
  clause in the Overview verdict ("1 settlement open").
- **Epochs tab** gains a **latency** column per slot: finalization height minus epoch close height
  (§6.2, second half).
- **Entitlements tab** unchanged, but every row's "why" is a link to the epoch's context line
  (§6.1, second half).

### 4.4 CoreSlot (`/coreslots/[slotId]`)

- **Overview tab:** the service document parsed into a field with a link, once the slot publishes it
  (§7.1). Until then the raw metadata view stays, as today.
- **Rewards tab:** **escrow balance** (settlement address, sampled, with sampled-at) and a
  **participants-per-epoch** chart (§6.5). Settlements table gains the latency column.

### 4.5 Settlement detail (`/mining/settlements/[slotId]/[epoch]`)

Add the split line at the top of the page (§6.1). Make the page reachable from the epoch detail and
from every account reward row, not only from the CoreSlot page (§6.6).

### 4.6 Search

Epoch becomes a searchable entity: a bare integer matches both a height and an epoch, and the
existing multiple-matches picker resolves it (§6.6).

### 4.7 Footer and Diagnostics

Render what `/status` already returns: chain id, build version, git sha, built-at, environment.
Add the indexer's canon version once it is exposed. A read-only product's provenance is part of its
trust.

## 5. Visual language — what to hold constant

- The verdict-first pattern: status dot, serif `h1`, one sentence carrying the numbers, a closed
  disclosure for detail. Every destination page keeps it.
- One number, once per page. The Dashboard view is the only place density is allowed, and it is
  deduplicated.
- Mono for every figure and identifier; serif for display; sans for prose. No new type roles.
- Tone colours carry meaning only: green healthy, yellow watch, red down or late, muted unknown.
  "Late" and "open" use the same tones as liveness so the eye learns one vocabulary.
- Caveats are sentences under the title, in the muted text role, exactly as `RewardCaveat` does
  today ("aggregate network-emission context, not claim truth"). Every derived figure carries one
  (§7.3).
- Links are the gold primary; a figure that links to its evidence is underlined on hover, a figure
  that cannot link to evidence is not shown as a fact (§7.3).

## 6. Data — what each surface needs and where it comes from

Effort and sources are as the team's schema evaluation established; this section is the build list
against it.

### 6.1 "Why this amount"

**Per-recipient split — available today, DTO join + one line of UI.**
`SlotEntitlementProjection.entitlementAmount` (the pool being split),
`MiningSettlementChunk.recipientCount` (K), `MiningSettlementPayout.amount` (this address's
share). The settlement route already returns all three; the account reward row needs the join.

**Per-slot entitlement — cite and self-check, do not infer.** The rule that splits the epoch pool
across active slots is normative in the chain canon (`docs/chain-canon/` in the AS design
repository mirrors it; the registry already shows each slot's reward weight). Display the canon's
formula with its section reference, compute it from `RewardEpochProjection.totalReward`,
`activeSlotCount` and the slot's reward weight, and show whether the computed value reproduces the
indexed entitlement for every epoch on record: *"matches 212 / 212 epochs"*. A match is a verified
figure. A mismatch is a finding for the chain team, and far more valuable than silence. This keeps
the never-guess invariant intact: the source is a cited rule, not a pattern in the numbers.

### 6.2 The clock

**Authoritative — a new observed-sample projector.** The chain-client transport already defines
`getEpochInfo`, `getCurrentEpochActiveBlocks`, `getEpochBoundaries`, `getSettlementClock`, and
`getOpenSettlements`, and nothing calls them. Write the projector in the same shape as the other
observed samples (sampled-at, age, staleness label), an API route, and the UI that consumes it.
This is the largest item in the phase and the one that makes the Overview verdict's clock
authoritative.

**Stopgap — an estimate, labelled.** `RewardsParamsChange.paramsJson.epochLength` plus
`RewardEpochProjection.height` of the last close gives the next close height; with the average
block time already computed on Overview, a countdown. It must carry the word *estimate* and must
invalidate itself when a params change of the queued/paused/resumed kinds lands mid-epoch.

**Settlement latency per slot — available today, no caveat.** `MiningSettlementFinalization.height`
minus `RewardEpochProjection.height` for the same epoch, aggregated per slot: median and p90,
shown as *"usually within N blocks of close"*.

### 6.3 Late and open settlements

**Available today, one join, one landmine.** `SlotEntitlementProjection` (expected) left-joined
against `MiningSettlementFinalization` (happened). No finalization and an entitlement exists =
open; open past the slot's usual latency = late; "how late" = current height minus epoch close.
Settled is true only when the chain emitted a finalization, never inferred — the same rule the
settlement page follows.

**Do not read `MiningSettlementProjection.finalized`.** That model is dead schema: defined,
referenced by a reset script and one test, written by no projector. Any feature reading it would
show every settlement as unfinalized forever. **Delete the model in this phase.**

### 6.4 The service document

Plumbing is ready (`operator-metadata.ts`, `KNOWN_KEYS`); the field is not present in live data
because the slot operator has not published it. See §7.1. When it appears, one `KNOWN_KEYS` entry
and a link-rendering branch.

### 6.5 Escrow balance and participants per epoch

**Participants per epoch — available today.** `MiningSettlementChunk.recipientCount` grouped by
slot and epoch (or a count of payout rows), rebuildable, no caveat.

**Escrow balance — small indexer change.** `balance-snapshot.ts` samples operator and payout
addresses only; add `settlementAddress` to `resolveAddressSet`, and add the field to the CoreSlot
detail DTO, which does not carry it yet. Sampled, so it shows sampled-at and age like every other
balance.

### 6.6 Navigation, search, provenance

- Settlement links from epoch detail and account reward rows: UI only; every target already has
  `(slotId, epochNumber)`.
- Epoch as a search entity: `search.ts` treats a bare integer as a height only;
  `RewardEpochProjection.epochNumber` is the second match; the picker resolves ambiguity.
- Footer and Diagnostics: `/status` already returns `chainId` and `build.*`; render them.

## 7. Three things outside the explorer's control, and what to ask for

### 7.1 The service document (ask the slot operator, and the chain team)

The AS ↔ client contract (§18.1) fixes what a slot advertises:

```json
{ "version": "twilight-slot-services-v1", "slot_id": "3", "authorization_server": "https://…" }
```

carried in the CoreSlot metadata, with the exact encoding deferred to the chain implementation.
Live data showing only `{moniker}` means the testnet slot has never set it, which is why every
client runs on the explicit AS URL fallback. Two asks: the slot operator publishes it for slot 3;
the twilight-core team confirms the encoding inside `MsgUpdateCoreSlotMetadata`. Then §6.4 is a
one-line change.

### 7.2 The entitlement rule (ask the chain team only if §6.1's self-check fails)

If the canon formula does not reproduce the indexed entitlements, report the epochs where it
diverges. Do not display a formula that the data contradicts.

### 7.3 Provenance, and the second data source that is coming

Operators will publish an **operator-status** feed (a contract the AS reference implementation
will ship, draft 0.2): the epoch clock with deadlines, and per-epoch **aggregates** — enrolled,
eligible, admitted, and counts per exclusion reason using the AS's own closed identifiers. It
carries **no per-address status**: `ADR-MINIS-0020` rules that the join between a participant and
an unpaid address is not published, so a participant's own per-epoch history is served only to
that participant, authenticated, through their own client. The explorer's per-address facts stay
chain-only; its "why" for an epoch is the aggregate: "12 of 13 eligible paid; 1 excluded
(`EXCLUDED_BELOW_FLOOR`) — check your agent's `status` for your own epochs". It is discovered per slot from the
service document and it is explanation, never fact.

The explorer's data layer needs one abstraction before that source arrives, because retrofitting
it onto a single-source schema is the expensive path: **every row carries its source and its fetch
time**, and every rendered figure carries one of three labels:

| label | meaning | today's examples |
|---|---|---|
| **chain** | fact, from an indexed event | payouts, finalizations, entitlements, blocks |
| **verified** | operator- or explorer-derived, and it matches a chain commitment | the §6.1 self-checked formula; later, an operator's per-epoch data that matches the sealed snapshot hash if settlement finalization carries one |
| **estimate / attested** | derived without a commitment, or published by an operator with none | the §6.2 stopgap countdown; later, operator status feeds |

The clock projector (§6.2) is the first projection of the observed-sample-with-provenance kind
that the operator feeds will need. Write it as the pattern, not as a one-off. The question to the
chain team that decides whether operator data can ever be *verified* rather than *attested*: does
settlement finalization carry, or can it carry, the sealed allocation snapshot hash?

## 8. States vocabulary

Every table and every figure on the participant surface renders one of these, never a blank:

```text
paid            settlement finalized, this address received an amount
open            entitlement exists, no finalization yet, within the slot's usual latency
late            open, past the slot's usual latency
remainder       the epoch's undistributed value went to the operator by deadline
not settled     the slot never finalized this epoch (terminal, if the epoch is closed)
estimate        a derived figure with no chain commitment (the clock stopgap)
unknown         the source needed to say more is not available (operator publishes no status)
```

Once the operator-status source exists, the per-epoch aggregate vocabulary uses the AS's own
closed identifiers verbatim (`NO_VERIFIED_ACTIVITY`, `EXCLUDED_BELOW_FLOOR`, `NOT_SELECTED_IN_DRAW`,
…) with a fixed caption each. Per-address reasons are never shown here; they are the participant's
own, in their client.

## 9. Cleanup in the same phase

- Delete the five dead components: `RewardsSummaryStrip`, `RewardsView`, `ClaimingCard`,
  `EmissionCharts`, `SupplySummaryStrip`. `ClaimingCard` first: the claim step is retired by canon,
  and a component that implies one is a latent lie waiting to be wired back in.
- Delete `MiningSettlementProjection` and the reset-script and test references to it (§6.3).

## 10. Phases and acceptance

**14a — placement and UI-only (no indexer change).**
Overview two views with persistence; `haltRiskReason` in the verdict; the address door; account
page reordered rewards-first with the split line and settlement links; Settlements tab and the
latency column; participants chart; epoch search; settlement links from epoch and account; footer
and Diagnostics provenance; page description lines; serif display in both themes; the third theme
if wanted; cleanup (§9).
*Accept when:* every item in §4 that needs no new indexing is present; no number appears twice on
Glance; Dashboard shows the deduplicated old set; a first visit lands on Glance; every table on the
participant surface renders a §8 state for its empty case; the dead components and model are gone.

**14b — indexer.**
The clock projector over the five unused transport methods, with sampled-at and staleness; the
estimate stopgap retired or kept as the fallback when the sample is stale; `settlementAddress` in
balance sampling and the CoreSlot DTO; the §6.1 self-check computed and displayed with its match
count; source and fetch-time on every projected row (§7.3).
*Accept when:* the Overview clock is authoritative and labelled as such; escrow balance shows on the
CoreSlot page with sampled-at; the self-check reports its match count over all indexed epochs; every
API row carries `source` and `sampledAt`/`indexedAt`.

**14c — external, as the owners deliver.**
Service document field (§7.1); operator-status feeds as a second source with per-slot health on a
new Operators page — for each slot: operator, AS, publishes status yes/no, last successful fetch and
age; an operator's silence is shown as silence, per slot, never as a blank on a participant's page.

## 11. Open questions, by owner

- **Slot operator (us):** publish the service document for slot 3.
- **twilight-core:** the metadata encoding of the service document; whether finalization carries
  the sealed snapshot hash.
- **twilight-minis:** the operator-status contract (drafted by the architecture side next), and
  which of its four reads the reference implementation ships first.
- **Product owner:** which old theme, if any, to restore as the third; whether Dashboard should be
  offered to first-time visitors as a labelled toggle only (recommended) or promoted.
