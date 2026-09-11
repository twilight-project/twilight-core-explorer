// Scoped reset for the operator-status feed samples. Deletes only OperatorStatusSample rows —
// never chain-derived rows. Samples are observed (not rebuildable): after a reset, history
// older than the feed's retention window is gone for good, which is honest — the feed is the
// operator's explanation, and an explanation that was never re-served cannot be re-observed.
export interface ResetOperatorStatusPrisma {
  operatorStatusSample: { deleteMany(args?: unknown): Promise<unknown> };
}

export async function resetOperatorStatus(prisma: ResetOperatorStatusPrisma): Promise<void> {
  await prisma.operatorStatusSample.deleteMany();
}
