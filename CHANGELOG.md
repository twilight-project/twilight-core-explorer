# Changelog

All notable changes to Twilight Core Explorer are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/):
the version describes the stability of the explorer's **public API** (`/api/v1/*`, the OpenAPI contract in
`docs/reference/openapi.json`) and its public URLs, not the chain's version. The running explorer reports
its release and commit at `GET /api/v1/status` (`data.build`).

## [Unreleased]

### Added
- `GET /api/v1/operators/{slotId}/history` — one row per UTC day for a slot: owed, paid and kept,
  owed and settled epoch counts, payout lines, miners paid and first-time miners, median settlement
  latency, and the operator's published enrolled/admitted counts (attested) for the same days. A day
  is the **close day of the epochs it holds**, so every figure in a row describes the same epochs.
- `paid7` on `GET /api/v1/operators/{slotId}/participants` — distinct addresses paid in the last 7
  days, beside the existing `paid30` and `paidAll`. Both additions are backwards compatible.
- Operator Overview carries a dashboard: a headline total, key metrics, a selectable daily history
  chart (distinct miners, paid, owed, kept, miners paid, new miners, enrolled, latency), compact
  tiles and a CSV export of the daily rows. It replaces the three-chart Trends panel, and loads on
  demand so the rest of the page does not carry the chart code.

### Fixed
- Miners per day were counted against the day the **payout transaction** landed, while every other
  figure in the row was counted against the day the **epoch closed**. Operators settle some hundreds
  of blocks after a close, so payouts routinely cross midnight UTC and a day's miner count sat beside
  another day's owed/paid/kept figures — and a payout landing on a day with no epoch close was
  dropped from the series entirely.
- An attested feed count that was not a plain integer aborted the history query, which hid that day's
  chain figures. Only a non-negative integer of up to 9 digits is read; anything else is no value.
- "Miners paid, last 7d" summed each day's distinct-miner count, so a miner paid on several days was
  counted once per day.
- The daily windows behind the dashboard counted rows rather than calendar days, so for a slot with
  idle days "the last 30 days" could reach back over several months.
- The headline delta and the paid tile were labelled "today" from the newest row even when no epoch
  had closed today, dating stale figures to now.

## [1.0.0] — 2026-10-29

**The first release.** Everything built so far: a Twilight-native explorer for **Twilight Core** (a
CometBFT chain with CoreSlot PoA validators and a native `x/rewards` module), made of an indexer, a
strictly DB-only public API and a web explorer. From this release on, `/api/v1/*` is a stable contract:
a breaking change to it means a new major version.

Runs against Twilight testnet. Twilight Core is a pre-1.0 public testnet, and this explorer has not been
externally audited.

### Indexing and data model
- Ingests blocks, transactions, messages, events and accounts from CometBFT RPC + Cosmos/Twilight REST into
  Postgres. These generic rows are the single source of truth; everything else is derived from them.
- Descriptor-backed protobuf decoding of Twilight transactions, with decode failures recorded, never
  guessed.
- Cursor-resume ingestion with idempotent re-ingest of any height range; block-level events read from
  CometBFT `finalize_block_events` (ABCI++).
- A single `ChainClient` transport boundary; indexers and projectors never call RPC/REST directly.

### CoreSlot semantics
- Rebuildable projections for CoreSlot metadata, lifecycle, payout, params and key rotation, plus a
  **temporal consensus map** (validator-set membership at `validatorUpdateHeight + 2`, genesis-seeded).
- Ambiguous or inconsistent history becomes a `ProjectionFailure` (idempotent `failureKey`), never a
  guessed value. Failed transactions never create semantic state.
- Operator identity: one operator = one CoreSlot, with moniker/address display.

### Liveness, signing and network health
- Block-signature ingestion and signature → CoreSlot attribution; proposer attribution.
- Per-height expected-signer / missed evidence, per-(slot, window) liveness summaries, CoreSlot health
  labels and a network halt-risk snapshot.
- Network views: validator set at a height, proposer leaderboard, signing heatmap.

### Rewards, mining and supply
- Rewards semantic projection (epochs, claims, entitlements); claim truth from `SlotRewards.claimed` +
  `reward_claimed` events, with `EpochReward` treated as aggregate context only.
- Observed (sampled) rewards and balance/supply snapshots, kept separate from rebuildable projections and
  always labelled with their sample height and age.
- Mining settlements (devnet-2): per-epoch settlement state, payouts and latency.
- Read-only economics: no claim actions in the UI. Claiming is CLI-only (`twilightd`).

### Operators
- Operator profile with Overview / Details / Data / Authentication pages: verdict ("do they pay?"),
  signing health, participants (paid addresses from chain, enrolled count attested), track record and
  trends.
- The operator's own status feed (clock, epochs, discovery, OAuth AS metadata and JWKS, selection-draw
  record) is sampled as **attested** data and labelled as such. The sampler is origin-locked,
  redirect-refusing, byte-capped and depth-limited, with a privacy guard (no per-address or per-user data
  is stored, and refusals never echo the refused data).
- **Independent draw verification:** a port of the reference `selectionv1` verifier re-derives each
  selection draw from chain data (anchor memo, beacon window blocks and proposer attribution, the policy
  in force at the anchor height) and shows *verified*, *mismatch* or *unverifiable*, with the reasons and
  limits named.

### Public API (`/api/v1`)
- A strictly DB-only Fastify + TypeBox service: health, status, blocks, transactions, accounts, search,
  CoreSlots/validators, liveness/health/network, rewards/supply/balances, mining, and the operator
  endpoints. OpenAPI spec committed and drift-tested; Scalar reference at `/docs`.
- Envelopes `{ data }`, `{ data, page }` (opaque keyset cursors) and `{ error }`; BigInt amounts and
  heights as strings.
- Transport hardening: security headers, ETag + revalidate-only caching, per-client rate limiting behind
  the Cloudflare → Caddy proxy (`API_TRUST_PROXY`), structured logging, and a build stamp on `/status`.

### Web explorer
- Next.js 16 (app router) + Tailwind, consuming only the public API: overview, search, blocks,
  transactions, accounts, CoreSlots / slots, liveness, network, rewards, supply, economy, mining
  settlements and the operator pages.
- Explicit freshness and empty states (API down, indexer lag, projection failure, stale or missing
  sample; never a fabricated `0`), accessible tables, and the Twilight brand theme.
- Favicon, share cards, sitemap and robots, with the canonical origin from `NEXT_PUBLIC_SITE_URL`.

### Security and dependencies
- Node 24 LTS (images and CI), Next 16, React 19; the image optimizer endpoint is disabled.
- 0 open Dependabot alerts at release. The one remaining `npm audit` finding (`deepmerge-ts` via the
  Prisma CLI) is build- and migration-time only, and is cleared by Prisma 7.

### Operations
- Docker images for the backend and web, and `docker-compose.devnet.yml` (Postgres, migrate, indexer,
  projector, API, web, Caddy), with container log rotation.
- Caddy origin behind Cloudflare: domain and origin TLS from configuration (`EXPLORER_DOMAIN`,
  `ORIGIN_TLS`), API and web bound to loopback, TLS material and `.env` files kept out of images.
- A guarded, tag-only deploy procedure (runbook §13): only a `v*` tag reachable from `main`, clean tree
  required, build stamp from the tag.
- Release gate: `npm run rc-check` (with the `RC_LIVE=1` tier); a ~2,500-block localnet soak ran green
  (53 checks).

### Known limitations
- The devnet soak is still deferred (Issue #41); the soak so far is localnet.
- Postgres backups and a tested restore (N3) and rotating the default database password (N5) are
  operational tasks on the deployment host.
- Draw verification does not yet check the single-anchor rule, and compares only the selection rate and
  max-selected with the chain policy. The badge says so.
- Rate limiting is in-process (single instance).

Milestones that led here: `explorer-phase-8-liveness-backend`, `explorer-phase-9-public-api`,
`explorer-phase-10-web-explorer`, `explorer-phase-11-twilight-surfaces`,
`explorer-phase-12-rewards-economics`, `explorer-phase-13`.

[Unreleased]: https://github.com/twilight-project/twilight-core-explorer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/twilight-project/twilight-core-explorer/releases/tag/v1.0.0
