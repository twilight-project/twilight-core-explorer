# Devnet Deploy Runbook — long-running validation

A practical runbook to bring the explorer up against **devnet** for long-term validation — first locally
("see it"), then on AWS. This is the **pre-Phase-14** validation deploy: basic public-exposure safety
**yes**, the §5 scale/ops hardening (Redis rate-limit store, proxy keying, lag monitoring) **deferred**.

> Pairs with `explorer-release-readiness.md` (the env contract + §5 deferred register). For the synthetic
> localnet soak see `../research/phase-13d-3-soak-{plan,report}.md` and `scripts/soak/`.

## 0. The operating model (read this first)

- **Ingest is forward-incremental, cursor-based.** `npm --prefix apps/indexer start` runs **once**: it reads
  the chain tip + the `IndexerCursor`, ingests `cursor+1 … tip`, then **exits**. So "continuous" = run it on
  a **cadence** (a loop / cron / always-on tick). The cursor guarantees you **never re-ingest** — the genesis
  backfill happens **once**; a code change or bug does **not** re-backfill.
- **Projections are the same** — cursor-based, forward. On a projection bugfix you `RESET_PROJECTION=true`
  *that one projection* and it re-derives from the **already-ingested local Postgres rows** (a DB→DB
  transform — minutes, not a chain re-fetch). You almost never touch the genesis backfill again.
- **Rewards claim reconciliation is snapshot-driven.** `rewards-snapshot` lands the observed
  `SlotRewardProjection` rows and (since the forward-incremental reconcile fix) resolves any transient
  `missing_reward_records` failure — so a forward-only deploy stays clean with **zero accumulation**.

## 1. Prerequisites

- A reachable **devnet** node: CometBFT RPC (**`http(s)://`** — *not* `tcp://`) + Cosmos/Twilight REST
  (REST is needed for the rewards/balance observed-sample snapshots).
- **Postgres 16** (RDS or a container).
- **Node ≥ 18** + this repo built (`npm install && npm run build`).
- `protoc` is **not** needed at deploy time (the descriptor artifact is committed).

## 2. Configuration (env) — incl. the basic-safety posture

The one part you cannot skip for a **public** deploy is the security posture — the explorer's env default is
fail-*open* (unknown/unset → `development` = permissive).

**Indexer** (writes; a read-write DB role):
```
DATABASE_URL=postgresql://twilight:<pw>@<pg-host>:5432/twilight_explorer?schema=public
COMET_RPC_URL=http://<devnet-rpc>:26657      # http(s) — NOT tcp://
REST_URL=http://<devnet-rest>:1317
CHAIN_ID=<devnet-chain-id>                    # MUST match the node, or the chain-id guard aborts ingest
```
**API** (reads; a **read-only** DB role — see §4):
```
API_DATABASE_URL=postgresql://explorer_ro:<pw>@<pg-host>:5432/twilight_explorer?schema=public
API_ENV=production                            # ⚠️ REQUIRED for a public deploy — enforces headers + CORS
CORS_ORIGINS=https://<your-web-origin>        # the web origin(s); never leave unset/`*` in production
RATE_LIMIT_ENABLED=true                        # in-process per-IP (the Redis/proxy-keying upgrade is §5/Ph14)
PORT=8080
HOST=0.0.0.0
APP_VERSION=<tag>                              # build stamp, with GIT_SHA + BUILT_AT; surfaces at
                                               # /api/v1/status data.build — see §13 (set per deploy)
```
**Web**:
```
NEXT_PUBLIC_API_BASE_URL=https://<your-api-origin>
NEXT_PUBLIC_UI_THEME=auction                   # default (AA-clean); renders the Twilight Operations
                                               # Console look. `legacy` is opt-in; gold-orbit /
                                               # minimal-operator selectable via the in-app toggle
```

> **Basic-safety checklist (non-negotiable when internet-reachable):** `API_ENV=production` set ·
> `CORS_ORIGINS` = the real web origin(s) · the API connects with a **read-only** DB role · rate limiter on.
> Everything else in readiness §5 is deferred.

## 3. One-time setup

```sh
# build (once, and on each deploy of new code)
npm install && npm run build

# create the DB + run migrations (uses DATABASE_URL)
npm run db:deploy
```

### 4. A read-only DB role for the API
The API is DB-only and must not write. Create a least-privilege role:
```sql
CREATE ROLE explorer_ro LOGIN PASSWORD '<pw>';
GRANT CONNECT ON DATABASE twilight_explorer TO explorer_ro;
GRANT USAGE ON SCHEMA public TO explorer_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO explorer_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO explorer_ro;   -- future tables
```
Point `API_DATABASE_URL` at `explorer_ro`. (The indexer keeps the read-write role via `DATABASE_URL`.)

## 5. Initial backfill (once)

```sh
# ingest genesis → current tip (END_HEIGHT unset = the live tip; the one long run)
npm --prefix apps/indexer start

# rebuild every projection once, in the load-bearing order (a fresh DB needs no RESET).
proj() { npm --prefix apps/indexer run "project:$1"; }
proj coreslot-semantic         # metadata(+genesis seed)→lifecycle→payout→params→key_rotation→temporal_map(+genesis window seed)
proj block-signatures; proj operator-signing-evidence
proj coreslot-liveness; proj coreslot-liveness-summary; proj coreslot-health
proj proposer-attribution
# rewards: snapshot BEFORE the semantic pass so claims reconcile on first processing (0 missing_reward_records)
SAMPLE_HEIGHT=$(curl -s http://<devnet-rpc>:26657/status | jq -r .result.sync_info.latest_block_height) \
  proj rewards-snapshot
proj rewards
SAMPLE_HEIGHT=$(curl -s http://<devnet-rpc>:26657/status | jq -r .result.sync_info.latest_block_height) \
  proj balance-snapshot
```
(For a big chain this is the one long catch-up. It is **not** repeated on code changes.)

## 6. Continuous operation (forward-incremental)

A simple tick loop keeps it current — ingest new heights, advance the projections, sample. Each step is
cursor-resume, so the loop only ever processes new data. The advisory lock prevents overlap.

```sh
#!/usr/bin/env bash
# run-indexer-tick.sh — one tick of the forward-incremental pipeline (schedule every ~15–30s via a loop/cron)
set -uo pipefail
P() { npm --prefix apps/indexer run "project:$1" || echo "WARN: project:$1 failed (will retry next tick)"; }
TIP=$(curl -s "$COMET_RPC_URL/status" | jq -r .result.sync_info.latest_block_height)

npm --prefix apps/indexer start || { echo "ingest failed; skipping projections this tick"; exit 0; }
P coreslot-semantic; P block-signatures; P operator-signing-evidence
P coreslot-liveness; P coreslot-liveness-summary; P coreslot-health; P proposer-attribution
P rewards                                  # process any new reward_claimed (may record transient failures)
SAMPLE_HEIGHT="$TIP" P rewards-snapshot     # sample + RECONCILE: clears the transient missing_reward_records
SAMPLE_HEIGHT="$TIP" P balance-snapshot
```
Run it as: a `while true; do ./run-indexer-tick.sh; sleep 20; done` supervisor, a systemd timer, or an ECS
scheduled task. (Projections needn't run every ingest tick — a slower cadence, e.g. every few minutes, is
fine; ingest can tick faster to keep lag low.)

## 7. API + web

```sh
# API (read-only role + production posture)
API_DATABASE_URL=... API_ENV=production CORS_ORIGINS=https://<web> RATE_LIMIT_ENABLED=true \
  node apps/api/dist/index.js

# Web (Next.js)
npm --prefix apps/web run build
NEXT_PUBLIC_API_BASE_URL=https://<api> npm --prefix apps/web start
```

## 8. Verify it's live + healthy

- `GET /api/v1/status` → `data.indexer.freshnessSeconds` / `lagBlocks` small + falling; `data.build` set;
  `data.projectionFailures.unresolvedCount` = 0 (the reconcile fix keeps rewards clean forward-only).
- Open the web origin → click blocks / coreslots / liveness / network / rewards with real devnet data.
- Optional gate against the live DB: `RC_LIVE=1 API_DATABASE_URL=<ro-url> npm run rc-check`.

## 9. See it locally first (against devnet)

Bring up Postgres locally and run the four processes against devnet before touching AWS:
```sh
docker compose up -d                              # local Postgres (the repo's docker-compose.yml)
npm run db:deploy
# then §5 backfill + §6 tick loop + §7 API/web, pointing COMET_RPC_URL/REST_URL at devnet,
# DATABASE_URL/API_DATABASE_URL at localhost:5432, NEXT_PUBLIC_API_BASE_URL at http://localhost:8080.
open http://localhost:3000
```
This is the "see what we built" step — and ingesting real devnet data here *is* the deferred Issue-#41
devnet acceptance, at higher fidelity than the localnet soak.

## 10. AWS shape (sketch — validation tier, not hardened prod)

| Component | Suggested AWS | Notes |
|---|---|---|
| **Postgres** | **RDS** (db.t-class) | one DB; the read-only role per §4; automated backups |
| **Indexer** | a small **EC2** or **ECS** task running the §6 tick loop (always-on) | the read-write `DATABASE_URL`; one instance (the advisory lock guards overlap anyway) |
| **API** | **ECS/Fargate** or EC2, behind an **ALB** | `API_ENV=production`, the read-only role, `CORS_ORIGINS` = the web origin; ALB gives TLS |
| **Web** | **Amplify / S3+CloudFront** (or a container) | `NEXT_PUBLIC_API_BASE_URL` = the API origin |

When you later put the API behind a CDN/proxy, that's the trigger for the §5 items: rate-limit `trustProxy`
+ XFF keying, a shared (Redis) limit store, fail-closed env, and a tightened CORS allow-list.

## 11. Operating notes (what to watch during validation)

- **Lag** — `/status` `lagBlocks`/`freshnessSeconds`. If it climbs and doesn't recover, the ingest tick
  isn't keeping up (speed up the cadence, or the node/DB is the bottleneck).
- **Disk** — projection + canonical rows grow; never pruned. Watch RDS storage (the soak report has a
  per-epoch growth projection method).
- **ProjectionFailures** — `/status` `unresolvedCount` should stay 0. A persistent non-zero is a real
  finding (the `/api` diagnostics page breaks it down by projection). For lingering rewards
  `missing_reward_records` specifically (e.g. left by a pre-fix deploy, or a claim seen during a REST
  outage), `npm --prefix apps/indexer run project:rewards-reconcile` clears them **DB-only** (no chain
  read, only `DATABASE_URL`) from the already-present rows — the same reconcile the snapshot runs
  automatically, available as a break-glass command.
- **A projection bugfix** → `RESET_PROJECTION=true npm --prefix apps/indexer run project:<name>` re-derives
  from local rows (minutes). The chain is untouched; no re-backfill.
- **Restart safety** — every step is cursor-resume + advisory-locked, so a crashed tick resumes cleanly.

## 12. Production topology — Cloudflare → Caddy origin (the current deployment)

The live explorer is **`https://explorer.nyks.dev`**, served from ONE box running `docker-compose.devnet.yml`
(the §10 AWS split is the later shape, not the current one):

```
browser ──TLS──▶ Cloudflare  (proxied DNS record: edge TLS, cache, DDoS)
                     │ TLS (origin cert: ORIGIN_TLS)
                     ▼
   origin :443  caddy ─┬─ /api/v1/*  /openapi.json  /health/*  ──▶ api:8080
                       ├─ /docs  ──▶ static Scalar page (caddy/docs)
                       └─ everything else  ──▶ web:3000 (Next.js)
   postgres / indexer / api / web: compose network + host loopback only — never public
```

Deployment-specific values live in the box's `.env.devnet` (never committed):
```
EXPLORER_DOMAIN=explorer.nyks.dev        # Caddy site address (caddy/Caddyfile has no hard-coded host)
ORIGIN_TLS=internal                      # or "/certs/origin.pem /certs/origin.key" — see below
NEXT_PUBLIC_API_BASE_URL=                # EMPTY = same-origin: the browser calls relative /api/v1/*
CORS_ORIGINS=https://explorer.nyks.dev
```
Moving to another hostname is a DNS record + these two values; nothing in the repo changes.

**Cloudflare settings (dashboard → the zone):**

| Setting | Value | Why |
|---|---|---|
| DNS record for the host | A/AAAA → origin, **Proxied** (orange cloud) | edge TLS + cache + DDoS, and the origin IP stays unpublished |
| SSL/TLS mode | **Full (strict)** with a Cloudflare **Origin CA** cert (`ORIGIN_TLS`); **Full** with `tls internal` is the baseline | strict makes Cloudflare authenticate the origin, not just encrypt to it |
| Always Use HTTPS · HSTS · min TLS 1.2 | on | |
| Cache rule | **Bypass cache for HTML** (cache only `/_next/static/*`) — or purge on every deploy (§13) | Next marks prerendered pages `s-maxage=31536000`; after a deploy, stale edge HTML points at JS chunks the new build no longer has |

For Full (strict): create an Origin CA certificate for the host in Cloudflare, save it on the box as
`caddy/certs/origin.pem` + `caddy/certs/origin.key` (gitignored), set
`ORIGIN_TLS="/certs/origin.pem /certs/origin.key"`, recreate caddy, then switch the SSL mode.

**Origin lock-down — this is what makes Cloudflare protective:**
- Firewall / security group: inbound **443 only from [Cloudflare's IP ranges](https://www.cloudflare.com/ips/)**,
  SSH only from admin IPs, nothing else. Compose binds 3000 / 8080 / 5432 to host loopback, so they stay
  private even if the security group is ever loosened.
- **Never publish the origin IP** — not in docs, issues, env examples, or an unproxied (grey-cloud) DNS
  record. With it, anyone can bypass Cloudflare and hit the origin directly; if it leaks, rotate it.
- Keep these in a private ops store, **not in this public repo**: origin IP/host, SSH access, Cloudflare
  account/zone IDs and API tokens, the Origin CA private key, `.env.devnet`.

> **Known gap (readiness §5 "proxy keying"):** the API rate-limits on `request.ip`, which behind
> Cloudflare → Caddy is Caddy's container address — so all clients share one bucket. Fix tracked
> separately (trust the proxy hop and key on the real client IP).

## 13. Releases and deploys (tag-based)

Production only ever runs a **tagged commit from `main`**. `v*` release tags are immutable (repo tag
ruleset); `explorer-phase-*` stay as phase-milestone markers.

1. **Cut the release** — on an up-to-date `main` with CI green:
   ```sh
   git tag -a v0.1.0 -m "v0.1.0" && git push origin v0.1.0
   gh release create v0.1.0 --generate-notes     # or notes from CHANGELOG.md
   ```
2. **Deploy it on the box** (shell env overrides `--env-file`, so the stamp always matches the checkout):
   ```sh
   git fetch --tags origin && git checkout v0.1.0
   export APP_VERSION=$(git describe --tags --exact-match) GIT_SHA=$(git rev-parse HEAD) \
          BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   docker compose -f docker-compose.devnet.yml --env-file .env.devnet up -d --build
   ```
3. **Purge the Cloudflare cache** (Caching → Configuration → Purge Everything) — skip only if the
   HTML-bypass cache rule from §12 is in place.
4. **Verify from outside:**
   ```sh
   curl -s https://explorer.nyks.dev/api/v1/status | jq .data.build          # version = the tag, gitSha = the commit
   curl -s -o /dev/null -w '%{http_code}\n' https://explorer.nyks.dev/_next/image   # 404 — optimizer disabled
   curl -s -o /dev/null -w '%{http_code}\n' https://explorer.nyks.dev/docs          # 200 — Scalar reference
   ```
   plus the §8 health checks.

**Rollback:** check out the previous tag and repeat step 2. Code rolls back; the database does not — the
`migrate` service only moves forward. Additive migrations are safe under older code; read the release notes
before rolling back across a migration that drops or renames anything.
