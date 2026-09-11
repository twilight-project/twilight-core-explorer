-- Operator-status feed samples (phase 15). Observed samples of an operator's own feed —
-- attested, never authoritative; one row per (slot, kind, epoch) via sampleKey.
CREATE TABLE "OperatorStatusSample" (
    "id" BIGSERIAL NOT NULL,
    "slotId" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "epochNumber" BIGINT,
    "sampleKey" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "payloadJson" JSONB,
    "sampledAt" TIMESTAMP(3),
    "asHeight" BIGINT,
    "fetchedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "lastHttpStatus" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAtDb" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorStatusSample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperatorStatusSample_sampleKey_key" ON "OperatorStatusSample"("sampleKey");
CREATE INDEX "OperatorStatusSample_slotId_kind_idx" ON "OperatorStatusSample"("slotId", "kind");
