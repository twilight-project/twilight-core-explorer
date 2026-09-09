# Twilight Custom-Module REST Routes

REST gRPC-gateway surface for the custom modules, served on the API server (default
`:1317`) alongside gRPC (`:9090`). These wrap the same protobuf `Query` services that
gRPC exposes; gRPC remains canonical, REST is the browser/wallet/operator wrapper.

- Enable with `app.toml` `[api] enable = true` (and `[grpc] enable = true`, default).
- All routes are **read-only** GETs. No write/admin routes exist (tx signing/broadcast
  stays the normal Cosmos tx flow).
- Status legend: `200` success · `400` invalid/missing required param · `404` valid
  request, no such record · `501` would mean the route is **not** wired (must never
  happen for the routes below).

Base URL in examples: `REST=http://localhost:1317`.

## x/rewards — `twilight.rewards.v1.Query`

| gRPC method | REST path | Request params | Response type | Example curl | Expected |
|---|---|---|---|---|---|
| `Params` | `/twilight/rewards/v1/params` | — | `QueryParamsResponse` | `curl $REST/twilight/rewards/v1/params` | 200 |
| `EpochInfo` | `/twilight/rewards/v1/epoch-info` | — | `QueryEpochInfoResponse` | `curl $REST/twilight/rewards/v1/epoch-info` | 200 |
| `NextHalving` | `/twilight/rewards/v1/next-halving` | — | `QueryNextHalvingResponse` | `curl $REST/twilight/rewards/v1/next-halving` | 200 |
| `EpochReward` | `/twilight/rewards/v1/epochs/{epoch_number}` | `epoch_number` (path, uint64) | `QueryEpochRewardResponse` | `curl $REST/twilight/rewards/v1/epochs/5` | 200; 404 if epoch not finalized |
| `EpochEntitlements` | `/twilight/rewards/v1/epochs/{epoch}/entitlements` | `epoch` (path, uint64); `pagination.*` (query) | `QueryEpochEntitlementsResponse` | `curl $REST/twilight/rewards/v1/epochs/233/entitlements` | 200 |
| `SlotEntitlement` | `/twilight/rewards/v1/slots/{slot_id}/entitlements/{epoch}` | `slot_id`, `epoch` (path, uint64) | `QuerySlotEntitlementResponse` | `curl $REST/twilight/rewards/v1/slots/1/entitlements/233` | 200; 404 if none |
| `EpochBoundaries` | `/twilight/rewards/v1/epochs/{epoch_number}/boundaries` | `epoch_number` (path, uint64) | `QueryEpochBoundariesResponse` | `curl $REST/twilight/rewards/v1/epochs/233/boundaries` | 200 |
| `PauseState` | `/twilight/rewards/v1/pause-state` | — | `QueryPauseStateResponse` | `curl $REST/twilight/rewards/v1/pause-state` | 200 |
| `EpochConfigVersions` | `/twilight/rewards/v1/epoch-config-versions` | `pagination.*` (query) | `QueryEpochConfigVersionsResponse` | `curl $REST/twilight/rewards/v1/epoch-config-versions` | 200 |
| `RewardConfigVersions` | `/twilight/rewards/v1/reward-config-versions` | `pagination.*` (query) | `QueryRewardConfigVersionsResponse` | `curl $REST/twilight/rewards/v1/reward-config-versions` | 200 |
| `CumulativeEmitted` | `/twilight/rewards/v1/cumulative-emitted` | — | `QueryCumulativeEmittedResponse` | `curl $REST/twilight/rewards/v1/cumulative-emitted` | 200 |
| `SupplySchedule` | `/twilight/rewards/v1/supply-schedule` | — | `QuerySupplyScheduleResponse` | `curl $REST/twilight/rewards/v1/supply-schedule` | 200 |
| `CurrentEpochActiveBlocks` | `/twilight/rewards/v1/current-epoch/active-blocks` | `pagination.*` (query) | `QueryCurrentEpochActiveBlocksResponse` | `curl $REST/twilight/rewards/v1/current-epoch/active-blocks` | 200 |
| `ModuleBalances` | `/twilight/rewards/v1/module-balances` | — | `QueryModuleBalancesResponse` | `curl $REST/twilight/rewards/v1/module-balances` | 200 |

**Retired (twilight-core `aa568f61`, "retire the legacy claim path"):**
`/twilight/rewards/v1/slots/{slot_id}/rewards` and
`/twilight/rewards/v1/slots/{slot_id}/claimable` no longer exist — they answer **501**.
Manual claiming is gone; a per-slot, per-epoch **entitlement** is now the unit of reward
truth, and release happens through `x/mining` settlements.

## x/coreslot — `twilight.coreslot.v1.Query`

| gRPC method | REST path | Request params | Response type | Example curl | Expected |
|---|---|---|---|---|---|
| `Params` | `/twilight/coreslot/v1/params` | — | `QueryParamsResponse` | `curl $REST/twilight/coreslot/v1/params` | 200 |
| `CoreSlot` | `/twilight/coreslot/v1/slots/{slot_id}` | `slot_id` (path, uint64) | `QueryCoreSlotResponse` | `curl $REST/twilight/coreslot/v1/slots/1` | 200; 400 if non-numeric |
| `CoreSlots` | `/twilight/coreslot/v1/slots` | `status` (query enum); `pagination.*` (query) | `QueryCoreSlotsResponse` | `curl $REST/twilight/coreslot/v1/slots` | 200 |
| `ActiveCoreSlots` | `/twilight/coreslot/v1/active-slots` | — | `QueryCoreSlotsResponse` | `curl $REST/twilight/coreslot/v1/active-slots` | 200 |
| `CoreSlotByOperator` | `/twilight/coreslot/v1/operators/{operator_address}` | `operator_address` (path, bech32) | `QueryCoreSlotResponse` | `curl $REST/twilight/coreslot/v1/operators/twilight1...` | 200; 404 if none |
| `CoreSlotByConsensusAddress` | `/twilight/coreslot/v1/consensus/{consensus_address}` | `consensus_address` (path, **hex**) | `QueryCoreSlotResponse` | `curl $REST/twilight/coreslot/v1/consensus/<HEXADDR>` | 200; 404 if none |
| `PendingKeyRotations` | `/twilight/coreslot/v1/pending-key-rotations` | — | `QueryPendingKeyRotationsResponse` | `curl $REST/twilight/coreslot/v1/pending-key-rotations` | 200 |
| `LastAppliedValidators` | `/twilight/coreslot/v1/last-applied-validators` | — | `QueryLastAppliedValidatorsResponse` | `curl $REST/twilight/coreslot/v1/last-applied-validators` | 200 |
| `ReservedConsensusAddress` | `/twilight/coreslot/v1/reserved-consensus-address/{consensus_address}` | `consensus_address` (path) | `QueryReservedConsensusAddressResponse` | `curl $REST/twilight/coreslot/v1/reserved-consensus-address/<addr>` | 200; 404 if none |
| `RewardWeight` | `/twilight/coreslot/v1/slots/{slot_id}/reward-weight` | `slot_id` (path, uint64) | `QueryRewardWeightResponse` | `curl $REST/twilight/coreslot/v1/slots/1/reward-weight` | 200 |
| `SelectionPolicy` | `/twilight/coreslot/v1/slots/{slot_id}/selection-policy` | `slot_id` (path, uint64) | `QuerySelectionPolicyResponse` | `curl $REST/twilight/coreslot/v1/slots/1/selection-policy` | 200 |
| `SelectionPolicyVersion` | `/twilight/coreslot/v1/slots/{slot_id}/selection-policy/version/{policy_version}` | `slot_id`, `policy_version` (path, uint64) | `QuerySelectionPolicyResponse` | `curl $REST/twilight/coreslot/v1/slots/1/selection-policy/version/1` | 200; 404 if none |
| `SelectionPolicyAtHeight` | `/twilight/coreslot/v1/slots/{slot_id}/selection-policy/height/{at_height}` | `slot_id`, `at_height` (path, uint64) — named `at_height`, not `height` (the SDK reserves `--height`) | `QuerySelectionPolicyResponse` | `curl $REST/twilight/coreslot/v1/slots/1/selection-policy/height/100` | 200 |

### Notes
- **`ActiveCoreSlots` uses `/active-slots`, not the legacy nested active route.** The
  legacy nested path collides with `/slots/{slot_id}` and is parsed as `slot_id="active"` → HTTP 400.
  The path was changed when REST was wired (API-0/1/2); the gRPC method name is
  unchanged. No prior REST consumer existed (REST was never served before this).
- `PendingKeyRotations`, `LastAppliedValidators`, `ReservedConsensusAddress`,
  `RewardWeight` had no `google.api.http` annotation before this work and were
  gRPC-only; they are now REST-exposed.
- Standard cosmos modules Twilight does **not** run (staking/gov/mint/distribution)
  return `501` by design — that is expected, not a regression.
- **`CoreSlotByConsensusAddress` / `ReservedConsensusAddress` take a hex-encoded
  consensus address** (the keeper rejects bech32 `valcons`). A real hex value is
  available from CometBFT `:26657/validators` (`validators[].address`).

Smoke check: `./scripts/smoke-api-surface.sh` (honors `BASE_REST`, `BASE_GRPC`,
`BASE_RPC`). It exercises `CoreSlotByOperator` (REST-sourced operator) and
`CoreSlotByConsensusAddress` (hex cons address via `BASE_RPC`) with real fixtures.

`ReservedConsensusAddress` 200 coverage:
- **Integration (deterministic):** `x/coreslot/keeper/query_server_test.go` seeds a
  reservation via genesis and via the realistic inactivate→remove lifecycle, then asserts
  the query returns it.
- **Smoke (opt-in):** a clean chain has no reservations, so the smoke check is gated on
  `RESERVED_CONS_HEX` (a known reserved lowercase-hex address) and skipped otherwise. To
  produce one on a localnet, run `scripts/seed-reservation.sh` after `init.sh` and before
  `start.sh`; it seeds a reservation into genesis and prints the hex to export:
  ```sh
  RESERVED_CONS_HEX="$(TWILIGHT_LOCALNET_HOME=<twilight-localnet-home> ./scripts/seed-reservation.sh -q)" \
    ./scripts/smoke-api-surface.sh
  ```

## x/mining — `twilight.mining.v1.Query`

`x/mining` is the **settlement / payout-distribution** workflow layered on `x/rewards`
entitlements — despite the module name there is no proof-of-work here. `x/rewards` finalizes
an epoch and creates immutable `SlotEntitlement`s; `x/mining` materializes one `Settlement`
per entitlement, the slot's **settlement address** submits chunks of participant payouts,
and finalization releases any remainder to the operator's payout address.

Two operational notes for clients:

- Settlement **creation is silent** — `x/mining`'s EndBlocker emits no events at all. Detect
  new settlements from the `epoch_finalized` event (the rewards EndBlocker runs immediately
  before mining in the same block), then query.
- `OpenSettlements`' page limit bounds rows **inspected**, not returned, so an empty page does
  not mean "no work"; follow `next_key` until it is empty. `pagination.total` is `"0"` on the
  `*-versions` endpoints even when items exist.

| gRPC method | REST path | Request params | Response type | Example curl | Expected |
|---|---|---|---|---|---|
| `SettlementClock` | `/twilight/mining/v1/settlement-clock` | — | `QuerySettlementClockResponse` | `curl $REST/twilight/mining/v1/settlement-clock` | 200 |
| `Settlement` | `/twilight/mining/v1/settlements/{slot_id}/{epoch}` | `slot_id`, `epoch` (path, uint64) | `QuerySettlementResponse` | `curl $REST/twilight/mining/v1/settlements/1/62` | 200; 404 if no settlement |
| `OpenSettlements` | `/twilight/mining/v1/slots/{slot_id}/open-settlements` | `slot_id` (path, uint64); `pagination.*` (query) | `QueryOpenSettlementsResponse` | `curl $REST/twilight/mining/v1/slots/3/open-settlements` | 200 |
| `DistributionModeVersions` | `/twilight/mining/v1/distribution-mode-versions` | `pagination.*` (query) | `QueryDistributionModeVersionsResponse` | `curl $REST/twilight/mining/v1/distribution-mode-versions` | 200 |
| `SelectionParamsVersions` | `/twilight/mining/v1/selection-params-versions` | `pagination.*` (query) | `QuerySelectionParamsVersionsResponse` | `curl $REST/twilight/mining/v1/selection-params-versions` | 200 |
| `SettlementParamsVersions` | `/twilight/mining/v1/settlement-params-versions` | `pagination.*` (query) | `QuerySettlementParamsVersionsResponse` | `curl $REST/twilight/mining/v1/settlement-params-versions` | 200 |
| `TargetEpochInterpretation` | `/twilight/mining/v1/target-epochs/{target_epoch}` | `target_epoch` (path, uint64) | `QueryTargetEpochInterpretationResponse` | `curl $REST/twilight/mining/v1/target-epochs/200` | 200 |
| `ValidateEconomicAddress` | `/twilight/mining/v1/economic-address` | `address` (**query**, not a path segment — the empty address must be expressible) | `QueryValidateEconomicAddressResponse` | `curl "$REST/twilight/mining/v1/economic-address?address=twilight1..."` | 200 |

There is **no** `Params` query for `x/mining`: its configuration lives in the three versioned
histories above.
