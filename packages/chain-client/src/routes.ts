export const COMET_RPC_ROUTES = {
  status: '/status',
  block: '/block',
  blockResults: '/block_results',
  genesis: '/genesis',
  genesisChunked: '/genesis_chunked',
  tx: '/tx',
} as const;

export const COSMOS_REST_ROUTES = {
  latestBlock: '/cosmos/base/tendermint/v1beta1/blocks/latest',
  block: '/cosmos/base/tendermint/v1beta1/blocks/{height}',
  nodeInfo: '/cosmos/base/tendermint/v1beta1/node_info',
  config: '/cosmos/base/node/v1beta1/config',
  supply: '/cosmos/bank/v1beta1/supply',
  balances: '/cosmos/bank/v1beta1/balances/{address}',
  tx: '/cosmos/tx/v1beta1/txs/{hash}',
  txs: '/cosmos/tx/v1beta1/txs',
} as const;

export const CORE_SLOT_REST_ROUTES = {
  params: '/twilight/coreslot/v1/params',
  slot: '/twilight/coreslot/v1/slots/{slot_id}',
  slots: '/twilight/coreslot/v1/slots',
  activeSlots: '/twilight/coreslot/v1/active-slots',
  byOperator: '/twilight/coreslot/v1/operators/{operator_address}',
  byConsensusAddress: '/twilight/coreslot/v1/consensus/{consensus_address}',
  pendingKeyRotations: '/twilight/coreslot/v1/pending-key-rotations',
  lastAppliedValidators: '/twilight/coreslot/v1/last-applied-validators',
  reservedConsensusAddress:
    '/twilight/coreslot/v1/reserved-consensus-address/{consensus_address}',
  rewardWeight: '/twilight/coreslot/v1/slots/{slot_id}/reward-weight',
  // V2 structural slot state: per-slot participant selection policy + its version history.
  // NOTE the path segment is `height`, but the query param the chain names is `at_height`
  // (the SDK reserves `--height`).
  selectionPolicy: '/twilight/coreslot/v1/slots/{slot_id}/selection-policy',
  selectionPolicyVersion:
    '/twilight/coreslot/v1/slots/{slot_id}/selection-policy/version/{policy_version}',
  selectionPolicyAtHeight:
    '/twilight/coreslot/v1/slots/{slot_id}/selection-policy/height/{at_height}',
} as const;

export const REWARDS_REST_ROUTES = {
  params: '/twilight/rewards/v1/params',
  epochInfo: '/twilight/rewards/v1/epoch-info',
  nextHalving: '/twilight/rewards/v1/next-halving',
  epochReward: '/twilight/rewards/v1/epochs/{epoch_number}',
  cumulativeEmitted: '/twilight/rewards/v1/cumulative-emitted',
  supplySchedule: '/twilight/rewards/v1/supply-schedule',
  currentEpochActiveBlocks: '/twilight/rewards/v1/current-epoch/active-blocks',
  moduleBalances: '/twilight/rewards/v1/module-balances',
  // V2 economic switchover. `slotRewards` + `claimableRewards` were REMOVED from the chain
  // in twilight-core aa568f61 ("retire the legacy claim path") and now answer 501 — the
  // per-slot, per-epoch entitlement replaces them as the unit of reward truth.
  epochEntitlements: '/twilight/rewards/v1/epochs/{epoch}/entitlements',
  slotEntitlement: '/twilight/rewards/v1/slots/{slot_id}/entitlements/{epoch}',
  epochBoundaries: '/twilight/rewards/v1/epochs/{epoch_number}/boundaries',
  pauseState: '/twilight/rewards/v1/pause-state',
  epochConfigVersions: '/twilight/rewards/v1/epoch-config-versions',
  rewardConfigVersions: '/twilight/rewards/v1/reward-config-versions',
} as const;

// x/mining — the settlement / payout-distribution workflow layered on rewards entitlements.
// Despite the module name there is no proof-of-work here.
export const MINING_REST_ROUTES = {
  settlementClock: '/twilight/mining/v1/settlement-clock',
  settlement: '/twilight/mining/v1/settlements/{slot_id}/{epoch}',
  openSettlements: '/twilight/mining/v1/slots/{slot_id}/open-settlements',
  distributionModeVersions: '/twilight/mining/v1/distribution-mode-versions',
  selectionParamsVersions: '/twilight/mining/v1/selection-params-versions',
  settlementParamsVersions: '/twilight/mining/v1/settlement-params-versions',
  targetEpochInterpretation: '/twilight/mining/v1/target-epochs/{target_epoch}',
  // Address is a QUERY param (`?address=`), not a path segment — an empty address must be
  // expressible, so there is no `{address}` token here.
  economicAddress: '/twilight/mining/v1/economic-address',
} as const;

export const REQUIRED_TWILIGHT_REST_ROUTES = [
  ...Object.values(CORE_SLOT_REST_ROUTES),
  ...Object.values(REWARDS_REST_ROUTES),
  ...Object.values(MINING_REST_ROUTES),
] as const;

export function buildPath(
  template: string,
  params: Record<string, string | number | bigint>,
): string {
  return Object.entries(params).reduce((path, [key, value]) => {
    return path.replace(`{${key}}`, encodeURIComponent(value.toString()));
  }, template);
}
