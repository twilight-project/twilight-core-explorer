-- #113: the rewards projection now writes RewardEpochProjection.blockTime from the close
-- block when it projects an epoch. Backfill rows projected before that from the Block at
-- the epoch's close height. Rows whose close block is not indexed stay null, as before.
UPDATE "RewardEpochProjection" AS re
SET "blockTime" = b."time"
FROM "Block" AS b
WHERE b."height" = re."height"
  AND re."blockTime" IS NULL
  AND b."time" IS NOT NULL;
