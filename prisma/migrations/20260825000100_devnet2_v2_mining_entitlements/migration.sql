-- devnet-2 V2 economic switchover.
--
-- The chain (twilight-core aa568f61) retired manual reward claiming: MsgClaimRewards, the
-- reward_claimed event and the two REST routes the old snapshot read are all gone. A
-- per-(slot, epoch) ENTITLEMENT is now the unit of reward truth, and release happens through
-- the new x/mining settlement workflow.
--
-- This migration is destructive for the claim tables by design: they can never be populated
-- again, and the explorer is single-chain (devnet-1 data is backed up separately and dropped
-- as part of the chain cutover).

-- 1. Retire the claim surface.
DROP TABLE IF EXISTS "RewardClaimEvent";
DROP TABLE IF EXISTS "SlotRewardProjection";

-- 2. Entitlements replace SlotRewardProjection. An entitlement is created silently when
--    x/rewards finalizes an epoch (only epoch_finalized is emitted), so it cannot be derived
--    from generic rows: it is an observed sample and carries sampledAtHeight.
CREATE TABLE "SlotEntitlementProjection" (
    "id" BIGSERIAL NOT NULL,
    "slotId" BIGINT NOT NULL,
    "epochNumber" BIGINT NOT NULL,
    "totalBlocksActive" BIGINT,
    "entitlementAmount" TEXT NOT NULL,
    "releasedAmount" TEXT NOT NULL,
    "denom" TEXT NOT NULL,
    "payoutAddress" TEXT,
    "rewardConfigVersion" BIGINT,
    "slotStatusAtEpochClose" TEXT,
    "activationSequenceAtEpochClose" BIGINT,
    "createdHeight" BIGINT,
    "sampledAtHeight" BIGINT NOT NULL,
    "rawSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAtDb" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SlotEntitlementProjection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SlotEntitlementProjection_slotId_epochNumber_key" ON "SlotEntitlementProjection"("slotId", "epochNumber");
CREATE INDEX "SlotEntitlementProjection_slotId_idx" ON "SlotEntitlementProjection"("slotId");
CREATE INDEX "SlotEntitlementProjection_epochNumber_idx" ON "SlotEntitlementProjection"("epochNumber");
CREATE INDEX "SlotEntitlementProjection_payoutAddress_idx" ON "SlotEntitlementProjection"("payoutAddress");
CREATE INDEX "SlotEntitlementProjection_sampledAtHeight_idx" ON "SlotEntitlementProjection"("sampledAtHeight");

-- 3. x/mining rebuildable semantic rows: chunk submissions and finalizations.
--    The chunk event carries only aggregates; individual payout lines exist ONLY in the tx
--    body, hence payoutsJson.
CREATE TABLE "MiningSettlementChunk" (
    "id" BIGSERIAL NOT NULL,
    "slotId" BIGINT NOT NULL,
    "epochNumber" BIGINT NOT NULL,
    "chunkIndex" BIGINT NOT NULL,
    "nextChunkIndex" BIGINT,
    "recipientCount" INTEGER,
    "chunkTotal" TEXT,
    "denom" TEXT,
    "height" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "msgIndex" INTEGER,
    "sourceEventId" BIGINT,
    "sourceMessageId" BIGINT,
    "payoutsJson" JSONB,
    "rawEventJson" JSONB,
    "rawMessageJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MiningSettlementChunk_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MiningSettlementChunk_sourceEventId_key" ON "MiningSettlementChunk"("sourceEventId");
CREATE INDEX "MiningSettlementChunk_slotId_idx" ON "MiningSettlementChunk"("slotId");
CREATE INDEX "MiningSettlementChunk_epochNumber_idx" ON "MiningSettlementChunk"("epochNumber");
CREATE INDEX "MiningSettlementChunk_height_idx" ON "MiningSettlementChunk"("height");
CREATE INDEX "MiningSettlementChunk_txHash_idx" ON "MiningSettlementChunk"("txHash");
CREATE INDEX "MiningSettlementChunk_slotId_epochNumber_idx" ON "MiningSettlementChunk"("slotId", "epochNumber");

CREATE TABLE "MiningSettlementFinalization" (
    "id" BIGSERIAL NOT NULL,
    "slotId" BIGINT NOT NULL,
    "epochNumber" BIGINT NOT NULL,
    "finalizationReason" TEXT,
    "releasedRemainder" TEXT,
    "denom" TEXT,
    "finalizedHeight" BIGINT,
    "height" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "msgIndex" INTEGER,
    "sourceEventId" BIGINT,
    "sourceMessageId" BIGINT,
    "rawEventJson" JSONB,
    "rawMessageJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MiningSettlementFinalization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MiningSettlementFinalization_sourceEventId_key" ON "MiningSettlementFinalization"("sourceEventId");
CREATE INDEX "MiningSettlementFinalization_slotId_idx" ON "MiningSettlementFinalization"("slotId");
CREATE INDEX "MiningSettlementFinalization_epochNumber_idx" ON "MiningSettlementFinalization"("epochNumber");
CREATE INDEX "MiningSettlementFinalization_height_idx" ON "MiningSettlementFinalization"("height");
CREATE INDEX "MiningSettlementFinalization_txHash_idx" ON "MiningSettlementFinalization"("txHash");
CREATE INDEX "MiningSettlementFinalization_slotId_epochNumber_idx" ON "MiningSettlementFinalization"("slotId", "epochNumber");

-- 4. Observed settlement state. Settlement CREATION is silent (x/mining's EndBlocker emits
--    nothing), and most of these fields are chain-derived rather than stored, so the row is
--    only true as of sampledAtHeight / sampledSettlementClock. The settlement clock is not a
--    block height: it only ticks while reward release is enabled.
CREATE TABLE "MiningSettlementProjection" (
    "id" BIGSERIAL NOT NULL,
    "slotId" BIGINT NOT NULL,
    "epochNumber" BIGINT NOT NULL,
    "distributionModeVersion" BIGINT,
    "settlementMode" TEXT,
    "settlementParamsVersion" BIGINT,
    "nextChunkIndex" BIGINT,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "finalizedHeight" BIGINT,
    "finalizationReason" TEXT,
    "entitlementAmount" TEXT,
    "releasedAmount" TEXT,
    "remainingAmount" TEXT,
    "participantDistributionCeiling" TEXT,
    "payoutAddress" TEXT,
    "createdSettlementClock" BIGINT,
    "deadlineClock" BIGINT,
    "permissionlessFinalizationNow" BOOLEAN,
    "sampledAtHeight" BIGINT NOT NULL,
    "sampledSettlementClock" BIGINT,
    "rawSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAtDb" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MiningSettlementProjection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MiningSettlementProjection_slotId_epochNumber_key" ON "MiningSettlementProjection"("slotId", "epochNumber");
CREATE INDEX "MiningSettlementProjection_slotId_idx" ON "MiningSettlementProjection"("slotId");
CREATE INDEX "MiningSettlementProjection_epochNumber_idx" ON "MiningSettlementProjection"("epochNumber");
CREATE INDEX "MiningSettlementProjection_finalized_idx" ON "MiningSettlementProjection"("finalized");
CREATE INDEX "MiningSettlementProjection_payoutAddress_idx" ON "MiningSettlementProjection"("payoutAddress");
CREATE INDEX "MiningSettlementProjection_sampledAtHeight_idx" ON "MiningSettlementProjection"("sampledAtHeight");

-- 5. CoreSlot V2 structural state: settlement address + selection policy history.
CREATE TABLE "CoreSlotSettlementAddressChange" (
    "id" BIGSERIAL NOT NULL,
    "slotId" BIGINT NOT NULL,
    "operatorAddress" TEXT,
    "settlementAddress" TEXT,
    "height" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "msgIndex" INTEGER,
    "sourceMessageId" BIGINT,
    "sourceEventId" BIGINT,
    "rawMessageJson" JSONB,
    "rawEventJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoreSlotSettlementAddressChange_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoreSlotSettlementAddressChange_sourceMessageId_key" ON "CoreSlotSettlementAddressChange"("sourceMessageId");
CREATE UNIQUE INDEX "CoreSlotSettlementAddressChange_sourceEventId_key" ON "CoreSlotSettlementAddressChange"("sourceEventId");
CREATE INDEX "CoreSlotSettlementAddressChange_slotId_idx" ON "CoreSlotSettlementAddressChange"("slotId");
CREATE INDEX "CoreSlotSettlementAddressChange_height_idx" ON "CoreSlotSettlementAddressChange"("height");
CREATE INDEX "CoreSlotSettlementAddressChange_txHash_idx" ON "CoreSlotSettlementAddressChange"("txHash");

CREATE TABLE "CoreSlotSelectionPolicyChange" (
    "id" BIGSERIAL NOT NULL,
    "slotId" BIGINT NOT NULL,
    "policyVersion" BIGINT,
    "selectionRateBps" INTEGER,
    "maxSelectedParticipants" BIGINT,
    "effectiveHeight" BIGINT,
    "operatorAddress" TEXT,
    "height" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "msgIndex" INTEGER,
    "sourceMessageId" BIGINT,
    "sourceEventId" BIGINT,
    "rawMessageJson" JSONB,
    "rawEventJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoreSlotSelectionPolicyChange_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoreSlotSelectionPolicyChange_sourceMessageId_key" ON "CoreSlotSelectionPolicyChange"("sourceMessageId");
CREATE UNIQUE INDEX "CoreSlotSelectionPolicyChange_sourceEventId_key" ON "CoreSlotSelectionPolicyChange"("sourceEventId");
CREATE INDEX "CoreSlotSelectionPolicyChange_slotId_idx" ON "CoreSlotSelectionPolicyChange"("slotId");
CREATE INDEX "CoreSlotSelectionPolicyChange_height_idx" ON "CoreSlotSelectionPolicyChange"("height");
CREATE INDEX "CoreSlotSelectionPolicyChange_txHash_idx" ON "CoreSlotSelectionPolicyChange"("txHash");
CREATE INDEX "CoreSlotSelectionPolicyChange_policyVersion_idx" ON "CoreSlotSelectionPolicyChange"("policyVersion");

-- 6. CoreSlotProjection gains the V2 structural columns (all nullable/additive).
ALTER TABLE "CoreSlotProjection"
    ADD COLUMN "settlementAddress" TEXT,
    ADD COLUMN "activationSequence" BIGINT,
    ADD COLUMN "activationEffectiveHeight" BIGINT,
    ADD COLUMN "currentSelectionPolicyVersion" BIGINT,
    ADD COLUMN "lastSelectionPolicyUpdateHeight" BIGINT;
CREATE INDEX "CoreSlotProjection_settlementAddress_idx" ON "CoreSlotProjection"("settlementAddress");
