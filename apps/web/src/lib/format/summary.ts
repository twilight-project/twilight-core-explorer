import { formatAmount } from './amount';

/**
 * Human summary strings for transactions (redesign: "rows describe what happened").
 *
 * Two tiers, honest about what each data shape carries:
 *  - LIST rows only have `messageTypes` (no decoded bodies), so their summaries are
 *    amount-less phrases derived from the type URL alone.
 *  - The DETAIL page has decoded messages, so its verdict can carry real amounts —
 *    always via formatAmount (BigInt); never Number().
 */
const TYPE_PHRASES: Record<string, string> = {
  '/cosmos.bank.v1beta1.MsgSend': 'Sent tokens',
  '/cosmos.bank.v1beta1.MsgMultiSend': 'Sent tokens (multi-send)',
  '/twilight.mining.v1.MsgSubmitSettlementChunk': 'Submitted settlement payouts',
  '/twilight.mining.v1.MsgFinalizeSettlement': 'Finalized a settlement',
  '/twilight.coreslot.v1.MsgRegisterCoreSlot': 'Registered a CoreSlot',
  '/twilight.coreslot.v1.MsgActivateCoreSlot': 'Activated a CoreSlot',
  '/twilight.coreslot.v1.MsgInactivateCoreSlot': 'Inactivated a CoreSlot',
  '/twilight.coreslot.v1.MsgSuspendCoreSlot': 'Suspended a CoreSlot',
  '/twilight.coreslot.v1.MsgRemoveCoreSlot': 'Removed a CoreSlot',
  '/twilight.coreslot.v1.MsgRotateConsensusKey': 'Rotated a consensus key',
  '/twilight.coreslot.v1.MsgUpdatePayoutAddress': 'Updated a payout address',
  '/twilight.coreslot.v1.MsgUpdateSettlementAddress': 'Updated a settlement address',
  '/twilight.coreslot.v1.MsgUpdateSelectionPolicy': 'Updated a selection policy',
  '/twilight.coreslot.v1.MsgUpdateOperatorMetadata': 'Updated CoreSlot metadata',
  '/twilight.coreslot.v1.MsgUpdateParams': 'Updated CoreSlot params',
  '/twilight.coreslot.v1.MsgScheduleUpgrade': 'Scheduled an upgrade',
  '/twilight.coreslot.v1.MsgCancelUpgrade': 'Cancelled an upgrade',
  '/twilight.rewards.v1.MsgUpdateRewardsParams': 'Updated rewards params',
  '/twilight.rewards.v1.MsgPauseRewards': 'Paused rewards',
  '/twilight.rewards.v1.MsgResumeRewards': 'Resumed rewards',
};

function shortTypeName(typeUrl: string): string {
  const name = typeUrl.split('.').at(-1) ?? typeUrl;
  return name.replace(/^Msg/, '');
}

function phraseFor(typeUrl: string): string {
  return TYPE_PHRASES[typeUrl] ?? shortTypeName(typeUrl);
}

/** List-row summary from messageTypes alone. Multi-message: "{first} +{n-1} more". */
export function summarizeMessageTypes(messageTypes: readonly string[]): string {
  if (messageTypes.length === 0) return 'Empty transaction';
  const first = phraseFor(messageTypes[0] as string);
  return messageTypes.length > 1 ? `${first} +${messageTypes.length - 1} more` : first;
}

interface DecodedMessage {
  typeUrl: string;
  decodedJson?: unknown;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** First coin of a `[{denom, amount}]` list, formatted for display; undefined when absent. */
function coinDisplay(value: unknown): string | undefined {
  const coins = Array.isArray(value) ? value : [];
  const first = asRecord(coins[0]);
  const amount = str(first.amount);
  const denom = str(first.denom);
  if (!amount || !denom) return undefined;
  const a = formatAmount(amount, denom);
  return `${a.display} ${a.symbol}`;
}

/** Sum of a settlement chunk's payout lines (BigInt-safe); undefined when malformed. */
function payoutsTotalDisplay(value: unknown): { total: string; count: number } | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  let sum = 0n;
  for (const entry of value) {
    const amount = str(asRecord(entry).amount);
    if (!amount || !/^\d+$/.test(amount)) return undefined;
    sum += BigInt(amount);
  }
  const a = formatAmount(sum.toString(), 'utwlt');
  return { total: `${a.display} ${a.symbol}`, count: value.length };
}

/**
 * Detail-page verdict from the first DECODED message. Falls back to the amount-less
 * phrase whenever the decode is missing or malformed — never an invented number.
 */
export function summarizeTxDetail(messages: readonly DecodedMessage[]): string {
  const first = messages[0];
  if (!first) return 'Empty transaction';
  const suffix = messages.length > 1 ? ` +${messages.length - 1} more` : '';
  const decoded = asRecord(first.decodedJson);

  if (first.typeUrl === '/cosmos.bank.v1beta1.MsgSend') {
    const coin = coinDisplay(decoded.amount);
    if (coin) return `Sent ${coin}${suffix}`;
  }
  if (first.typeUrl === '/twilight.mining.v1.MsgSubmitSettlementChunk') {
    const payouts = payoutsTotalDisplay(decoded.payouts);
    const slot = str(decoded.slot_id);
    const epoch = str(decoded.epoch);
    if (payouts && slot && epoch) {
      return `Paid ${payouts.total} to ${payouts.count} participant${payouts.count === 1 ? '' : 's'} · slot ${slot} epoch ${epoch}${suffix}`;
    }
  }
  if (first.typeUrl === '/twilight.mining.v1.MsgFinalizeSettlement') {
    const slot = str(decoded.slot_id);
    const epoch = str(decoded.epoch);
    if (slot && epoch) return `Finalized settlement · slot ${slot} epoch ${epoch}${suffix}`;
  }
  return `${phraseFor(first.typeUrl)}${suffix}`;
}

/** From/to (or signer) for the detail header's party chips. */
export function txParties(
  messages: readonly DecodedMessage[],
  signerAddresses: readonly string[],
): { from?: string; to?: string; signer?: string } {
  const decoded = asRecord(messages[0]?.decodedJson);
  const from = str(decoded.from_address);
  const to = str(decoded.to_address);
  if (from && to) return { from, to };
  const signer =
    str(decoded.settlement_address) ??
    str(decoded.signer) ??
    str(decoded.operator) ??
    str(decoded.authority) ??
    signerAddresses[0];
  return signer !== undefined ? { signer } : {};
}
