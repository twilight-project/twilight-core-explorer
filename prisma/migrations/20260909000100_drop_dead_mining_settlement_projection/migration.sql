-- Phase 14a cleanup: MiningSettlementProjection was dead schema — defined and reset, but
-- written by no projector — so any feature reading it would have shown every settlement as
-- unfinalized forever. Settlement state derives from the rebuildable chunk/finalization rows.
DROP TABLE IF EXISTS "MiningSettlementProjection";
