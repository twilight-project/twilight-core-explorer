export interface ChainClient {
  getStatus(): Promise<ChainStatus>;
  getGenesis(): Promise<GenesisSource>;
  getBlock(height: bigint): Promise<BlockSource>;
  getBlockResults(height: bigint): Promise<BlockResultsSource>;
  getTx(hash: string): Promise<TxSource>;
  getTxsByHeight(height: bigint): Promise<TxSource[]>;
  getSupply(height?: bigint): Promise<SupplySource[]>;
  getBalances(address: string, height?: bigint): Promise<ModuleSnapshot>;
  getCoreSlotParams(): Promise<ModuleSnapshot>;
  getCoreSlots(): Promise<ModuleSnapshot>;
  getActiveCoreSlots(): Promise<ModuleSnapshot>;
  getCoreSlot(slotId: bigint): Promise<ModuleSnapshot>;
  getCoreSlotByOperator(operatorAddress: string): Promise<ModuleSnapshot>;
  getCoreSlotByConsensusAddress(consensusAddress: string): Promise<ModuleSnapshot>;
  getPendingKeyRotations(): Promise<ModuleSnapshot>;
  getLastAppliedValidators(): Promise<ModuleSnapshot>;
  getReservedConsensusAddress(consensusAddress: string): Promise<ModuleSnapshot>;
  getRewardWeight(slotId: bigint): Promise<ModuleSnapshot>;
  getSelectionPolicy(slotId: bigint): Promise<ModuleSnapshot>;
  getSelectionPolicyVersion(slotId: bigint, policyVersion: bigint): Promise<ModuleSnapshot>;
  getSelectionPolicyAtHeight(slotId: bigint, atHeight: bigint): Promise<ModuleSnapshot>;
  getRewardsParams(): Promise<ModuleSnapshot>;
  getEpochInfo(): Promise<ModuleSnapshot>;
  getNextHalving(): Promise<ModuleSnapshot>;
  getEpochReward(epoch: bigint): Promise<ModuleSnapshot>;
  // Entitlements replace the retired claim queries as the unit of reward truth.
  getEpochEntitlements(epoch: bigint, pagination?: PaginationRequest): Promise<ModuleSnapshot>;
  getSlotEntitlement(slotId: bigint, epoch: bigint): Promise<ModuleSnapshot>;
  getEpochBoundaries(epoch: bigint): Promise<ModuleSnapshot>;
  getRewardsPauseState(): Promise<ModuleSnapshot>;
  getEpochConfigVersions(pagination?: PaginationRequest): Promise<ModuleSnapshot>;
  getRewardConfigVersions(pagination?: PaginationRequest): Promise<ModuleSnapshot>;
  getCumulativeEmitted(height?: bigint): Promise<ModuleSnapshot>;
  getSupplySchedule(): Promise<ModuleSnapshot>;
  getCurrentEpochActiveBlocks(): Promise<ModuleSnapshot>;
  getModuleBalances(height?: bigint): Promise<ModuleSnapshot>;
  // x/mining — settlement workflow.
  getSettlementClock(): Promise<ModuleSnapshot>;
  getSettlement(slotId: bigint, epoch: bigint): Promise<ModuleSnapshot>;
  getOpenSettlements(slotId: bigint, pagination?: PaginationRequest): Promise<ModuleSnapshot>;
  getDistributionModeVersions(pagination?: PaginationRequest): Promise<ModuleSnapshot>;
  getSelectionParamsVersions(pagination?: PaginationRequest): Promise<ModuleSnapshot>;
  getSettlementParamsVersions(pagination?: PaginationRequest): Promise<ModuleSnapshot>;
  getTargetEpochInterpretation(targetEpoch: bigint): Promise<ModuleSnapshot>;
  getEconomicAddressValidation(address: string): Promise<ModuleSnapshot>;
}

export interface GenesisSource {
  chainId: string | undefined;
  initialHeight: string;
  coreSlot: unknown;
  raw: unknown;
}

export interface ChainStatus {
  chainId: string | undefined;
  latestBlockHeight: string | undefined;
  catchingUp: boolean | undefined;
  raw: unknown;
}

export interface BlockSource {
  height: string;
  hash: string | undefined;
  time: string | undefined;
  raw: unknown;
}

export interface BlockResultsSource {
  height: string;
  beginBlockEvents: unknown[];
  endBlockEvents: unknown[];
  finalizeBlockEvents: unknown[];
  txResults: unknown[];
  raw: unknown;
}

export interface TxSource {
  hash: string;
  height: string | undefined;
  code: number | undefined;
  rawTxBase64?: string | undefined;
  raw: unknown;
}

export interface SupplySource {
  denom: string;
  amount: string;
  raw: unknown;
}

export interface PaginationRequest {
  limit?: bigint | number | string | undefined;
  offset?: bigint | number | string | undefined;
  key?: string | undefined;
  reverse?: boolean | undefined;
  countTotal?: boolean | undefined;
}

export interface ModuleSnapshot<T = unknown> {
  raw: T;
}
