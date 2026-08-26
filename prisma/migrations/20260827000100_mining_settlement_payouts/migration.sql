-- One row per recipient payout inside a settlement chunk.
--
-- Participants on this chain never claim: x/mining settlement pays them directly inside
-- MsgSubmitSettlementChunk, so a user's reward history IS their set of payout lines. Those
-- lines exist only in the transaction body and were being kept as JSON on the chunk row, which
-- cannot be indexed by recipient — answering "what has this address received" meant scanning
-- every chunk. Unnesting them makes the account-facing query a plain indexed lookup.
CREATE TABLE "MiningSettlementPayout" (
    "id" BIGSERIAL NOT NULL,
    "payoutKey" TEXT NOT NULL,
    "slotId" BIGINT NOT NULL,
    "epochNumber" BIGINT NOT NULL,
    "chunkIndex" BIGINT NOT NULL,
    "payoutIndex" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "denom" TEXT NOT NULL,
    "height" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "msgIndex" INTEGER,
    "sourceEventId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MiningSettlementPayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MiningSettlementPayout_payoutKey_key" ON "MiningSettlementPayout"("payoutKey");
CREATE INDEX "MiningSettlementPayout_recipient_idx" ON "MiningSettlementPayout"("recipient");
CREATE INDEX "MiningSettlementPayout_slotId_idx" ON "MiningSettlementPayout"("slotId");
CREATE INDEX "MiningSettlementPayout_epochNumber_idx" ON "MiningSettlementPayout"("epochNumber");
CREATE INDEX "MiningSettlementPayout_height_idx" ON "MiningSettlementPayout"("height");
CREATE INDEX "MiningSettlementPayout_txHash_idx" ON "MiningSettlementPayout"("txHash");
-- Backs the account page's keyset pagination (recipient filter + height DESC ordering).
CREATE INDEX "MiningSettlementPayout_recipient_height_idx" ON "MiningSettlementPayout"("recipient", "height");
