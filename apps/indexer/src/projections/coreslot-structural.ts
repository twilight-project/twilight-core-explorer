import {
  haltProjectionCursorError,
  updateProjectionCursorSuccess,
  type ProjectionCursorPrisma,
} from './cursor.js';
import {
  CORESLOT_SELECTION_POLICY_TYPE_URL,
  CORESLOT_SELECTION_POLICY_UPDATED_EVENT_TYPE,
  CORESLOT_SETTLEMENT_ADDRESS_TYPE_URL,
  CORESLOT_SETTLEMENT_UPDATED_EVENT_TYPE,
  CORESLOT_STRUCTURAL_EVENT_TYPES,
  CORESLOT_STRUCTURAL_PROJECTION,
  CORESLOT_STRUCTURAL_TYPE_URLS,
  withProjectionFailureKey,
  type ProjectionFailureInput,
} from './types.js';

/**
 * Rebuildable projection for CoreSlot V2 structural state (projection coreslot_structural_v1):
 * the per-slot SETTLEMENT ADDRESS (who may submit x/mining settlement chunks for the slot) and
 * the SELECTION POLICY history (participant-selection rate and cap, versioned).
 *
 * Both events follow the same shape rule as `coreslot_payout_updated`: the event names the slot
 * and operator but deliberately omits the new VALUE, so the address / policy numbers are read
 * from the decoded message body. An event whose message cannot be correlated still records the
 * change (with the value null) rather than being dropped — the change definitely happened; only
 * its payload is unavailable.
 *
 * Writes the history tables AND folds the current value onto CoreSlotProjection, matching how
 * coreslot-payout maintains `payoutAddress`.
 */
export interface ProjectCoreSlotStructuralRangeArgs {
  prisma: CoreSlotStructuralProjectionPrisma;
  chainId: string;
  startHeight: bigint;
  endHeight: bigint;
}

export interface ProjectCoreSlotStructuralHeightArgs {
  prisma: CoreSlotStructuralProjectionPrisma;
  chainId: string;
  height: bigint;
}

export interface ProjectCoreSlotStructuralResult {
  height: bigint;
  rowsWritten: number;
  failuresCreated: number;
}

export interface CoreSlotStructuralProjectionPrisma extends ProjectionCursorPrisma {
  explorerTransaction: { findMany(args: unknown): Promise<TransactionSource[]> };
  message: { findMany(args: unknown): Promise<MessageSource[]> };
  event: { findMany(args: unknown): Promise<EventSource[]> };
  coreSlotSettlementAddressChange: { upsert(args: unknown): Promise<unknown> };
  coreSlotSelectionPolicyChange: { upsert(args: unknown): Promise<unknown> };
  coreSlotProjection: { upsert(args: unknown): Promise<unknown> };
  projectionFailure: {
    upsert(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: CoreSlotStructuralProjectionPrisma) => Promise<T>): Promise<T>;
}

interface TransactionSource {
  hash: string;
  height: bigint;
  code: number | null;
  status: string;
}

interface MessageSource {
  id: bigint;
  txHash: string;
  height: bigint;
  msgIndex: number;
  typeUrl: string;
  decodedJson: unknown | null;
  rawJson: unknown | null;
}

interface EventSource {
  id: bigint;
  height: bigint;
  txHash: string | null;
  msgIndex: number | null;
  type: string;
  attributesJson: unknown;
}

interface Counters {
  rowsWritten: number;
  failuresCreated: number;
}

export async function projectCoreSlotStructuralRange(
  args: ProjectCoreSlotStructuralRangeArgs,
): Promise<ProjectCoreSlotStructuralResult[]> {
  const results: ProjectCoreSlotStructuralResult[] = [];
  for (let height = args.startHeight; height <= args.endHeight; height += 1n) {
    results.push(await projectCoreSlotStructuralHeight({
      prisma: args.prisma,
      chainId: args.chainId,
      height,
    }));
  }
  return results;
}

export async function projectCoreSlotStructuralHeight(
  args: ProjectCoreSlotStructuralHeightArgs,
): Promise<ProjectCoreSlotStructuralResult> {
  const { prisma, chainId, height } = args;

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.projectionFailure.deleteMany({
        where: {
          projectionName: CORESLOT_STRUCTURAL_PROJECTION,
          sourceHeight: height,
          resolved: false,
        },
      });

      const transactions = await tx.explorerTransaction.findMany({
        where: { height, OR: [{ status: 'success' }, { code: 0 }] },
        select: { hash: true, height: true, code: true, status: true },
      });
      const successfulTxHashes = new Set(transactions.map((t) => t.hash));

      const messages = successfulTxHashes.size === 0
        ? []
        : await tx.message.findMany({
            where: {
              height,
              txHash: { in: [...successfulTxHashes] },
              typeUrl: { in: [...CORESLOT_STRUCTURAL_TYPE_URLS] },
            },
            orderBy: [{ txHash: 'asc' }, { msgIndex: 'asc' }],
          });

      const events = await tx.event.findMany({
        where: { height, type: { in: [...CORESLOT_STRUCTURAL_EVENT_TYPES] } },
        orderBy: [{ id: 'asc' }],
      });

      const counters: Counters = { rowsWritten: 0, failuresCreated: 0 };

      for (const event of events) {
        if (isFailedTxBound(event, successfulTxHashes)) continue;
        if (event.type === CORESLOT_SETTLEMENT_UPDATED_EVENT_TYPE) {
          await projectSettlementAddress(tx, { event, messages, counters });
        } else if (event.type === CORESLOT_SELECTION_POLICY_UPDATED_EVENT_TYPE) {
          await projectSelectionPolicy(tx, { event, messages, counters });
        }
      }

      await updateProjectionCursorSuccess(tx, CORESLOT_STRUCTURAL_PROJECTION, chainId, height);
      return { height, rowsWritten: counters.rowsWritten, failuresCreated: counters.failuresCreated };
    });
  } catch (error) {
    await haltProjectionCursorError(prisma, CORESLOT_STRUCTURAL_PROJECTION, chainId, height, error);
    throw error;
  }
}

async function projectSettlementAddress(
  tx: CoreSlotStructuralProjectionPrisma,
  args: { event: EventSource; messages: MessageSource[]; counters: Counters },
): Promise<void> {
  const { event, counters } = args;
  const attrs = attributesToRecord(event.attributesJson);
  const slotId = parseBigInt(attrs.slot_id);
  if (slotId === undefined) {
    await recordInvalidSlot(tx, event, counters);
    return;
  }

  const message = correlateMessage(args.messages, event, CORESLOT_SETTLEMENT_ADDRESS_TYPE_URL);
  const decoded = message ? asRecord(message.decodedJson) : {};
  // The event omits the address by design; it lives only in the message body.
  const settlementAddress = readString(decoded.settlement_address)
    ?? readString(decoded.settlementAddress)
    ?? null;

  await tx.coreSlotSettlementAddressChange.upsert({
    where: { sourceEventId: event.id },
    create: {
      slotId,
      operatorAddress: attrs.operator_address ?? null,
      settlementAddress,
      height: event.height,
      txHash: event.txHash ?? '',
      msgIndex: event.msgIndex,
      sourceEventId: event.id,
      sourceMessageId: message?.id ?? null,
      rawEventJson: buildRawEventJson(event),
      rawMessageJson: message?.rawJson ?? undefined,
    },
    update: {
      operatorAddress: attrs.operator_address ?? null,
      settlementAddress,
      sourceMessageId: message?.id ?? null,
      rawEventJson: buildRawEventJson(event),
      rawMessageJson: message?.rawJson ?? undefined,
    },
  });
  counters.rowsWritten += 1;

  if (settlementAddress !== null) {
    await tx.coreSlotProjection.upsert({
      where: { slotId },
      create: {
        slotId,
        settlementAddress,
        updatedHeight: event.height,
        lastSourceHeight: event.height,
        lastSourceEventId: event.id,
      },
      update: {
        settlementAddress,
        updatedHeight: event.height,
        lastSourceHeight: event.height,
        lastSourceEventId: event.id,
      },
    });
  } else {
    await createFailure(tx, {
      sourceHeight: event.height,
      sourceEventId: event.id,
      eventType: event.type,
      failureKind: 'missing_message',
      rawEventJson: buildRawEventJson(event),
      error:
        `${event.type} at height ${event.height} has no correlated `
        + `${CORESLOT_SETTLEMENT_ADDRESS_TYPE_URL} message; the new settlement address is `
        + 'unavailable (the event does not carry it).',
    });
    counters.failuresCreated += 1;
  }
}

async function projectSelectionPolicy(
  tx: CoreSlotStructuralProjectionPrisma,
  args: { event: EventSource; messages: MessageSource[]; counters: Counters },
): Promise<void> {
  const { event, counters } = args;
  const attrs = attributesToRecord(event.attributesJson);
  const slotId = parseBigInt(attrs.slot_id);
  if (slotId === undefined) {
    await recordInvalidSlot(tx, event, counters);
    return;
  }

  const message = correlateMessage(args.messages, event, CORESLOT_SELECTION_POLICY_TYPE_URL);
  const decoded = message ? asRecord(message.decodedJson) : {};
  // policy_version and effective_height ARE on the event; the rate/cap are message-only.
  const policyVersion = parseBigInt(attrs.policy_version);
  const effectiveHeight = parseBigInt(attrs.effective_height);
  const selectionRateBps = parseInt32(
    readString(decoded.selection_rate_bps) ?? readString(decoded.selectionRateBps),
  );
  const maxSelectedParticipants = parseBigInt(
    readString(decoded.max_selected_participants) ?? readString(decoded.maxSelectedParticipants),
  );

  await tx.coreSlotSelectionPolicyChange.upsert({
    where: { sourceEventId: event.id },
    create: {
      slotId,
      policyVersion: policyVersion ?? null,
      selectionRateBps,
      maxSelectedParticipants: maxSelectedParticipants ?? null,
      effectiveHeight: effectiveHeight ?? null,
      operatorAddress: attrs.operator_address ?? null,
      height: event.height,
      txHash: event.txHash ?? '',
      msgIndex: event.msgIndex,
      sourceEventId: event.id,
      sourceMessageId: message?.id ?? null,
      rawEventJson: buildRawEventJson(event),
      rawMessageJson: message?.rawJson ?? undefined,
    },
    update: {
      policyVersion: policyVersion ?? null,
      selectionRateBps,
      maxSelectedParticipants: maxSelectedParticipants ?? null,
      effectiveHeight: effectiveHeight ?? null,
      operatorAddress: attrs.operator_address ?? null,
      sourceMessageId: message?.id ?? null,
      rawEventJson: buildRawEventJson(event),
      rawMessageJson: message?.rawJson ?? undefined,
    },
  });
  counters.rowsWritten += 1;

  if (policyVersion !== undefined) {
    await tx.coreSlotProjection.upsert({
      where: { slotId },
      create: {
        slotId,
        currentSelectionPolicyVersion: policyVersion,
        lastSelectionPolicyUpdateHeight: event.height,
        updatedHeight: event.height,
        lastSourceHeight: event.height,
        lastSourceEventId: event.id,
      },
      update: {
        currentSelectionPolicyVersion: policyVersion,
        lastSelectionPolicyUpdateHeight: event.height,
        updatedHeight: event.height,
        lastSourceHeight: event.height,
        lastSourceEventId: event.id,
      },
    });
  }
}

async function recordInvalidSlot(
  tx: CoreSlotStructuralProjectionPrisma,
  event: EventSource,
  counters: Counters,
): Promise<void> {
  await createFailure(tx, {
    sourceHeight: event.height,
    sourceEventId: event.id,
    eventType: event.type,
    failureKind: 'invalid_slot_id',
    rawEventJson: buildRawEventJson(event),
    error: `Invalid slot_id on ${event.type}: ${attributesToRecord(event.attributesJson).slot_id}`,
  });
  counters.failuresCreated += 1;
}

function correlateMessage(
  messages: MessageSource[],
  event: EventSource,
  typeUrl: string,
): MessageSource | undefined {
  if (!event.txHash) return undefined;
  const candidates = messages.filter((m) => m.txHash === event.txHash && m.typeUrl === typeUrl);
  if (candidates.length === 0) return undefined;
  if (event.msgIndex !== null) {
    return candidates.find((m) => m.msgIndex === event.msgIndex);
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

function isFailedTxBound(event: EventSource, successfulTxHashes: Set<string>): boolean {
  return event.txHash !== null && !successfulTxHashes.has(event.txHash);
}

async function createFailure(
  prisma: Pick<CoreSlotStructuralProjectionPrisma, 'projectionFailure'>,
  input: Omit<ProjectionFailureInput, 'projectionName' | 'module'>,
): Promise<void> {
  const data = withProjectionFailureKey({
    projectionName: CORESLOT_STRUCTURAL_PROJECTION,
    module: 'coreslot',
    ...input,
  });
  await prisma.projectionFailure.upsert({
    where: { failureKey: data.failureKey },
    create: data,
    update: { ...data, resolved: false, resolvedAt: null },
  });
}

// --- helpers ---------------------------------------------------------------

function attributesToRecord(attributesJson: unknown): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const entry of readArray(attributesJson) ?? []) {
    const record = asRecord(entry);
    const key = readString(record.key);
    if (key !== undefined) out[key] = readString(record.value);
  }
  return out;
}

function buildRawEventJson(event: EventSource): unknown {
  return { id: event.id.toString(), type: event.type, attributes: event.attributesJson };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseBigInt(value: string | undefined): bigint | undefined {
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined;
  return BigInt(value.trim());
}

function parseInt32(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}
