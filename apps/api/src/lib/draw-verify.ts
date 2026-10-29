import { createHash } from 'node:crypto';

// Independent re-derivation of a published selection draw (twilight-minis selectionv1).
// Normative reference: twilight-minis internal/selectionv1 (hash.go, draw.go, beacon.go,
// selectionv1.go), drawanchor/memo.go and docs/verifying-a-draw.md. Everything consumed here
// is either the operator's published record (the thing under test) or rows this explorer
// indexed from the chain (anchor tx memo + height, block-id hashes, proposer attribution,
// selection-policy changes) — so a green result means the chain confirms the draw.
//
// Hard rules, learned from the adversarial review of the first version:
//  - The record is hostile input. No field of it may size a loop, an allocation or a query:
//    every number passes a bounded parser, the beacon iterates ONLY over fetched rows, and
//    all placement checks run before any per-block work.
//  - The expected outcome is re-derived for EVERY case (NO_CANDIDATES / SUCCESS /
//    NO_VALID_BEACON) — a verdict must never be green because a check didn't run.
//  - Missing chain data degrades a check to null (and the verdict to 'unverifiable'),
//    never to a silent pass; a contradiction is false ('mismatch').

const DOMAIN_CANDIDATE_SET = 'TWILIGHT/TOKENDROP/CANDIDATE-SET/V1';
const DOMAIN_BEACON = 'TWILIGHT/TOKENDROP/BEACON/V1';
const DOMAIN_TICKET = 'TWILIGHT/TOKENDROP/TICKET/V1';
const DOMAIN_SELECTED = 'TWILIGHT/PARTICIPANT-SELECTION/SELECTED-DRAW-IDS/V1';
const PARAMS_VERSION_TAG = 'TWILIGHT_MINIS_DRAW_PARAMETERS_HASH_V1';

/** Upper bound for any height/count the record may name (12 digits ≈ 10^12 blocks). */
const MAX_UINT_DIGITS = 12;
/** Hard cap on a beacon window we are willing to verify, whatever the record claims. */
export const MAX_WINDOW_BLOCKS = 2048n;
/** Hard cap on candidates we are willing to hash per request (the chain caps lower). */
const MAX_CANDIDATES = 65536;

function u16be(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}
function u32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
function u64be(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(n);
  return b;
}
function sha256(...parts: Buffer[]): Buffer {
  return createHash('sha256').update(Buffer.concat(parts)).digest();
}

/** 64 hex chars of EITHER case → 32 bytes (block-id hashes are stored uppercase). */
function hex32(s: unknown): Buffer | null {
  if (typeof s !== 'string' || !/^[0-9a-fA-F]{64}$/.test(s)) return null;
  return Buffer.from(s.toLowerCase(), 'hex');
}

/** A draw id per the contract: exactly 64 LOWERCASE hex chars, not all-zero. */
function drawId32(s: unknown): Buffer | null {
  if (typeof s !== 'string' || !/^[0-9a-f]{64}$/.test(s)) return null;
  const b = Buffer.from(s, 'hex');
  return b.every((x) => x === 0) ? null : b;
}

/**
 * Bounded unsigned parser for record-controlled numbers: JSON number or digit string,
 * integer, at most MAX_UINT_DIGITS digits. Anything else is null — a record cannot name a
 * value large enough to size work on our side.
 */
export function toBoundedBig(v: unknown): bigint | null {
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || v < 0) return null;
    v = String(v);
  }
  if (typeof v !== 'string' || !/^\d+$/.test(v) || v.length > MAX_UINT_DIGITS) return null;
  return BigInt(v);
}

function ctxBytes(chainId: string, slotId: bigint, epoch: bigint): Buffer {
  const cid = Buffer.from(chainId, 'utf8');
  return Buffer.concat([u16be(cid.length), cid, u64be(slotId), u64be(epoch)]);
}

export function candidateSetHashV1(
  chainId: string,
  slotId: bigint,
  epoch: bigint,
  drawIds: Buffer[],
): Buffer {
  return sha256(
    Buffer.from(DOMAIN_CANDIDATE_SET, 'ascii'),
    ctxBytes(chainId, slotId, epoch),
    u64be(BigInt(drawIds.length)),
    ...drawIds,
  );
}

// The params digest framing (internal/preimage): each field U32BE(len) || bytes, numbers as
// base-10 ASCII, the version tag first, names never hashed.
const PARAM_FIELD_ORDER = [
  'selection_params_version',
  'selection_policy_version',
  'selection_rate_bps',
  'max_selected_participants',
  'max_selected_participants_per_selection',
  'max_candidates_per_selection',
  'beacon_start_offset_blocks',
  'beacon_window_blocks',
  'chain_min_external_beacon_blocks',
  'chain_min_distinct_external_proposers',
  'min_external_beacon_blocks',
  'min_distinct_external_proposers',
] as const;

export interface DrawParameters {
  values: Record<(typeof PARAM_FIELD_ORDER)[number], bigint>;
  excludeTargetSlotProposals: boolean;
}

/**
 * Parse + validate the record's parameters. This is a port of the Go
 * DrawParameters.Validate (internal/allocation/draw_parameters.go) plus
 * Thresholds.Validate (internal/selectionv1/beacon.go) — parameters that could not have
 * produced a checkable draw are refused outright, because an operator who may invent them
 * freely can otherwise describe a draw whose randomness was predictable at commit time and
 * still collect a plain "verified".
 *
 * Note the DIRECTION of the relaxation rule, which is easy to get backwards: an applied
 * threshold may only go DOWNWARD from the chain's (a deployment may weaken a rule and
 * publish it), so an applied minimum ABOVE the chain's is malformed — it claims a
 * requirement the protocol never sanctioned.
 */
export function parseParameters(
  raw: unknown,
):
  | { params: DrawParameters; reason?: undefined; explorerLimit?: undefined }
  | { params: null; reason: string; explorerLimit?: boolean } {
  if (typeof raw !== 'object' || raw === null) return { params: null, reason: 'parameters absent' };
  const rec = raw as Record<string, unknown>;
  const values = {} as DrawParameters['values'];
  for (const name of PARAM_FIELD_ORDER) {
    const field = rec[name];
    const v = toBoundedBig(field);
    if (v === null) {
      // A well-formed unsigned integer the chain allows but this explorer cannot represent
      // exactly (beyond MAX_UINT_DIGITS digits, or a JSON number past 2^53) is OUR limit,
      // not the operator's error: report it as unverifiable, never as a mismatch.
      const isLargeUint =
        (typeof field === 'string' && /^\d+$/.test(field)) ||
        (typeof field === 'number' && Number.isInteger(field) && field >= 0);
      return isLargeUint
        ? { params: null, reason: `${name} is beyond what this explorer can verify exactly`, explorerLimit: true }
        : { params: null, reason: `${name} missing or not an unsigned integer` };
    }
    values[name] = v;
  }
  if (typeof rec['exclude_target_slot_proposals'] !== 'boolean') {
    return { params: null, reason: 'exclude_target_slot_proposals is not a boolean' };
  }
  // Bounds (Go: Bounds().Validate()).
  if (values.selection_rate_bps <= 0n || values.selection_rate_bps > 5000n) {
    return { params: null, reason: 'selection_rate_bps outside (0, 5000]' };
  }
  if (values.max_selected_participants === 0n) return { params: null, reason: 'max_selected_participants is 0' };
  if (values.max_selected_participants_per_selection === 0n) {
    return { params: null, reason: 'max_selected_participants_per_selection is 0' };
  }
  // DrawParameters.Validate.
  if (values.selection_params_version === 0n) {
    return { params: null, reason: 'no selection_params_version: a verifier has no chain row to read' };
  }
  if (values.selection_policy_version === 0n) return { params: null, reason: 'no selection_policy_version' };
  if (values.beacon_start_offset_blocks === 0n) {
    return {
      params: null,
      reason: 'beacon_start_offset_blocks is 0: the window would open at the anchor height, so the commitment would be made with seed material already visible',
    };
  }
  if (values.beacon_window_blocks === 0n) return { params: null, reason: 'beacon_window_blocks is 0: a window of no blocks carries no randomness' };
  if (values.beacon_window_blocks > MAX_WINDOW_BLOCKS) {
    // The chain sets no window ceiling; this cap only bounds OUR work → unverifiable.
    return {
      params: null,
      reason: `beacon_window_blocks above this explorer's ${MAX_WINDOW_BLOCKS}-block verification cap`,
      explorerLimit: true,
    };
  }
  if (values.max_candidates_per_selection === 0n) return { params: null, reason: 'max_candidates_per_selection is 0' };
  if (values.chain_min_external_beacon_blocks === 0n || values.chain_min_distinct_external_proposers === 0n) {
    return { params: null, reason: "the chain's own thresholds are not recorded, so a relaxation cannot be judged" };
  }
  if (values.min_external_beacon_blocks > values.chain_min_external_beacon_blocks) {
    return {
      params: null,
      reason: `applied min_external_beacon_blocks ${values.min_external_beacon_blocks} exceeds the chain's ${values.chain_min_external_beacon_blocks}: a threshold may be weakened, never claimed stronger than the protocol sanctioned`,
    };
  }
  if (values.min_distinct_external_proposers > values.chain_min_distinct_external_proposers) {
    return {
      params: null,
      reason: `applied min_distinct_external_proposers ${values.min_distinct_external_proposers} exceeds the chain's ${values.chain_min_distinct_external_proposers}`,
    };
  }
  // Thresholds.Validate over the declared window.
  if (values.min_external_beacon_blocks === 0n) return { params: null, reason: 'min_external_beacon_blocks is 0' };
  if (values.min_distinct_external_proposers === 0n) return { params: null, reason: 'min_distinct_external_proposers is 0' };
  if (values.min_distinct_external_proposers > values.min_external_beacon_blocks) {
    return {
      params: null,
      reason: 'min_distinct_external_proposers exceeds min_external_beacon_blocks: a set of blocks cannot hold more distinct proposers than blocks',
    };
  }
  if (values.min_external_beacon_blocks > values.beacon_window_blocks) {
    return { params: null, reason: 'min_external_beacon_blocks exceeds the window length, so the threshold can never be met' };
  }
  // The driver refuses to run with the target-slot exclusion off.
  if (!rec['exclude_target_slot_proposals']) {
    return { params: null, reason: 'exclude_target_slot_proposals is false; the draw driver refuses that configuration' };
  }
  return { params: { values, excludeTargetSlotProposals: true } };
}

export function paramsHashV1(params: DrawParameters): Buffer {
  const field = (v: string) => {
    const b = Buffer.from(v, 'ascii');
    return Buffer.concat([u32be(b.length), b]);
  };
  const parts: Buffer[] = [field(PARAMS_VERSION_TAG)];
  for (const name of PARAM_FIELD_ORDER) parts.push(field(params.values[name].toString()));
  parts.push(field(params.excludeTargetSlotProposals ? '1' : '0'));
  return sha256(...parts);
}

/**
 * Parse + canonicalize the candidate list (ports NewCandidateSet): lowercase 64-hex ids,
 * no all-zero id, no duplicates, strictly increasing raw-byte order, bounded count.
 * Returns null when the list is not canonical.
 */
export function parseCandidates(raw: unknown, maxFromParams: bigint): Buffer[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_CANDIDATES || BigInt(raw.length) > maxFromParams) return null;
  const out: Buffer[] = [];
  for (const entry of raw) {
    const id = drawId32(entry);
    if (id === null) return null;
    const prev = out[out.length - 1];
    if (prev && Buffer.compare(prev, id) >= 0) return null; // sorted, no duplicates
    out.push(id);
  }
  return out;
}

export interface WindowBlock {
  height: bigint;
  /** Block-ID hash hex (either case) or null when unindexed. */
  hash: string | null;
  /** Attributed proposer slot. null = this explorer has NO final attribution (missing data). */
  proposerSlotId: bigint | null;
}

export interface BeaconComputation {
  entries: { height: bigint; slot: bigint; hash: Buffer }[];
  usable: number;
  distinct: number;
  excludedTarget: number;
  /** Heights this explorer could not supply (unindexed block or non-final attribution). */
  missing: number;
}

/**
 * Assess the beacon window from the FETCHED rows only — never from record-declared bounds.
 * A height absent from `blocks`, without a hash, or without final attribution counts as
 * missing: missing data degrades verification, it never substitutes a guess (the contract's
 * "unattributable" is the OPERATOR's claim; ours comes from proposer attribution).
 */
export function assessBeacon(
  blocks: WindowBlock[],
  startHeight: bigint,
  endHeight: bigint,
  targetSlot: bigint,
): BeaconComputation {
  const windowLen = Number(endHeight - startHeight + 1n);
  const byHeight = new Map<bigint, WindowBlock>();
  for (const b of blocks) {
    if (b.height >= startHeight && b.height <= endHeight) byHeight.set(b.height, b);
  }
  const entries: BeaconComputation['entries'] = [];
  let excludedTarget = 0;
  let present = 0;
  for (const [, b] of [...byHeight.entries()].sort((a, z) => (a[0] < z[0] ? -1 : 1))) {
    const hash = hex32(b.hash);
    if (hash === null || b.proposerSlotId === null) continue; // stays missing
    present++;
    if (b.proposerSlotId === targetSlot) excludedTarget++;
    else entries.push({ height: b.height, slot: b.proposerSlotId, hash });
  }
  const distinct = new Set(entries.map((e) => e.slot.toString())).size;
  return {
    entries,
    usable: entries.length,
    distinct,
    excludedTarget,
    missing: windowLen - present,
  };
}

export function beaconHashV1(
  chainId: string,
  slotId: bigint,
  epoch: bigint,
  setHash: Buffer,
  startHeight: bigint,
  endHeight: bigint,
  entries: BeaconComputation['entries'],
): Buffer {
  return sha256(
    Buffer.from(DOMAIN_BEACON, 'ascii'),
    ctxBytes(chainId, slotId, epoch),
    setHash,
    u64be(startHeight),
    u64be(endHeight),
    u64be(BigInt(entries.length)),
    ...entries.flatMap((e) => [u64be(e.height), u64be(e.slot), e.hash]),
  );
}

/** K = min(max(1, rate_k), M, P, floor(C/2)); C=0→0, C=1→1. Integer arithmetic only. */
export function winnerCount(c: bigint, rateBps: bigint, maxSel: bigint, maxPerSel: bigint): bigint {
  if (c === 0n) return 0n;
  if (c === 1n) return 1n;
  const rateK = (c / 10000n) * rateBps + ((c % 10000n) * rateBps) / 10000n;
  let k = rateK < 1n ? 1n : rateK;
  for (const cap of [maxSel, maxPerSel, c / 2n]) if (cap < k) k = cap;
  return k;
}

export function ticketV1(
  chainId: string,
  slotId: bigint,
  epoch: bigint,
  setHash: Buffer,
  beaconHash: Buffer,
  drawId: Buffer,
): Buffer {
  return sha256(
    Buffer.from(DOMAIN_TICKET, 'ascii'),
    ctxBytes(chainId, slotId, epoch),
    setHash,
    beaconHash,
    drawId,
  );
}

export function selectedDrawIdsHashV1(
  chainId: string,
  slotId: bigint,
  epoch: bigint,
  winnersInRankOrder: Buffer[],
): Buffer {
  return sha256(
    Buffer.from(DOMAIN_SELECTED, 'ascii'),
    ctxBytes(chainId, slotId, epoch),
    u64be(BigInt(winnersInRankOrder.length)),
    ...winnersInRankOrder,
  );
}

export interface DrawCheck {
  name: string;
  /** true = holds, false = contradicted, null = could not be computed from available data. */
  ok: boolean | null;
  detail: string;
}

export interface DrawVerification {
  result: 'verified' | 'mismatch' | 'unverifiable';
  checks: DrawCheck[];
  /** Honest limits of a green verdict (e.g. the single-anchor rule is not yet checked). */
  caveats: string[];
}

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}
/**
 * Compare our recomputed digest with a published one. `null` only when WE could not compute
 * ours; a published digest that is missing or not a string is malformed (Go's checkShape
 * refuses such a record), so it is `false` — which also lets the foundation short-circuit
 * stop a malformed record before the expensive re-derivation.
 */
function hexEq(buf: Buffer | null, hexStr: unknown): boolean | null {
  if (buf === null) return null;
  if (typeof hexStr !== 'string') return false;
  return buf.toString('hex') === hexStr.toLowerCase();
}

/** Strict anchor-memo decode per drawanchor: exactly {v,slot,epoch,set,params}, v === 1. */
export function decodeAnchorMemo(memo: string | null): {
  slot: bigint;
  epoch: bigint;
  set: string;
  params: string;
} | null {
  if (!memo || memo.length > 256) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(memo);
  } catch {
    return null;
  }
  const m = rec(parsed);
  const keys = Object.keys(m).sort().join(',');
  if (keys !== 'epoch,params,set,slot,v') return null;
  if (m['v'] !== 1) return null;
  const slot = toBoundedBig(m['slot']);
  const epoch = toBoundedBig(m['epoch']);
  if (slot === null || slot === 0n || epoch === null) return null;
  if (typeof m['set'] !== 'string' || !/^[0-9a-f]{64}$/.test(m['set'])) return null;
  if (typeof m['params'] !== 'string' || !/^[0-9a-f]{64}$/.test(m['params'])) return null;
  if (/^0+$/.test(m['set']) || /^0+$/.test(m['params'])) return null;
  return { slot, epoch, set: m['set'], params: m['params'] };
}

export interface ChainPolicy {
  /** The policy version of the row, so the record's claimed version can be checked. */
  policyVersion: bigint | null;
  selectionRateBps: bigint | null;
  maxSelectedParticipants: bigint | null;
}

/**
 * Re-derive the whole draw from the published record + what this explorer indexed.
 * All record-controlled values pass bounded parsing before ANY work is sized by them.
 */
export function verifyDraw(input: {
  chainId: string;
  slotId: bigint;
  epoch: bigint;
  record: unknown;
  anchor: { memo: string | null; height: bigint } | null;
  blocks: WindowBlock[];
  /** The indexed on-chain selection policy in force at the anchor height, when available
   *  (M4). The caller must choose it by anchor height, never by the record's version. */
  chainPolicy?: ChainPolicy | null;
}): DrawVerification {
  const { chainId, slotId, epoch } = input;
  const checks: DrawCheck[] = [];
  const caveats: string[] = [
    'single-anchor rule not checked (anchor address not curated); a dishonest operator could anchor several candidate sets and publish the winning one',
  ];
  const push = (name: string, ok: boolean | null, detail: string) =>
    checks.push({ name, ok, detail });
  const finish = (): DrawVerification => {
    const anyFalse = checks.some((c) => c.ok === false);
    const allTrue = checks.length > 0 && checks.every((c) => c.ok === true);
    return { result: anyFalse ? 'mismatch' : allTrue ? 'verified' : 'unverifiable', checks, caveats };
  };

  if (!chainId) {
    push('context_available', null, 'no chain id indexed yet — nothing can be verified');
    return finish();
  }

  const r = rec(input.record);
  const anchorRec = rec(r['anchor']);

  // 1. Parameters: bounded, internally valid (Parameters.Validate), hash matches the
  //    anchored commitment.
  // The record's own shape first (Go checkShape): a record that does not describe THIS
  // chain/slot/epoch, or names an unknown version, is not evidence about this draw at all.
  const shapeProblems: string[] = [];
  if (toBoundedBig(r['version']) !== 1n) shapeProblems.push('version is not 1');
  if (r['chain_id'] !== chainId) shapeProblems.push(`chain_id is not ${chainId}`);
  if (toBoundedBig(r['slot_id']) !== slotId) shapeProblems.push(`slot_id is not ${slotId}`);
  if (toBoundedBig(r['target_epoch']) !== epoch) shapeProblems.push(`target_epoch is not ${epoch}`);
  if (Array.isArray(r['winners']) && (r['winners'] as unknown[]).some((w) => typeof w !== 'string')) {
    shapeProblems.push('winners contains a non-string entry');
  }
  push(
    'record_shape',
    shapeProblems.length === 0,
    shapeProblems.length === 0
      ? `version 1 record for ${chainId}, slot ${slotId}, epoch ${epoch}`
      : shapeProblems.join('; '),
  );

  const parsed = parseParameters(r['parameters']);
  const params = parsed.params;
  push(
    'parameters_valid',
    params !== null ? true : parsed.explorerLimit ? null : false,
    params ? 'every rule of the reference DrawParameters/Thresholds validation holds' : parsed.reason,
  );
  const pHash = params ? paramsHashV1(params) : null;
  push(
    'parameters_hash',
    pHash ? hexEq(pHash, anchorRec['committed_params_hash']) : null,
    'recomputed from the published parameters vs anchor.committed_params_hash',
  );

  // 2. M4 (partial): the K-driving parameters must match the slot's indexed on-chain
  //    selection policy, when one is indexed.
  if (params) {
    const pol = input.chainPolicy;
    // Only the two K-driving fields the chain indexes are compared; the reference verifier
    // compares eleven, so say so even on a green verdict.
    caveats.push(
      'window, offset, thresholds and caps are not compared with the chain (only the selection rate and max-selected are)',
    );
    if (!pol || (pol.selectionRateBps === null && pol.maxSelectedParticipants === null)) {
      caveats.push('on-chain selection policy not indexed for this slot — the committed parameters could not be compared with the chain');
    } else {
      // MAJ-1: the row is the one in force AT THE ANCHOR, chosen by the chain-indexed
      // anchor height (never by the version the record names — a forged parameter set
      // would name whichever version makes it look right). The record's version, rate and
      // max must all match that row.
      const versionOk =
        pol.policyVersion === null || pol.policyVersion === params.values.selection_policy_version;
      const rateOk = pol.selectionRateBps === null || pol.selectionRateBps === params.values.selection_rate_bps;
      const maxOk =
        pol.maxSelectedParticipants === null ||
        pol.maxSelectedParticipants === params.values.max_selected_participants;
      push(
        'parameters_match_chain_policy',
        versionOk && rateOk && maxOk,
        `chain policy in force at the anchor: v${pol.policyVersion ?? '?'}, rate ${pol.selectionRateBps ?? '?'} bps, max ${pol.maxSelectedParticipants ?? '?'}` +
          ` · record names v${params.values.selection_policy_version}, rate ${params.values.selection_rate_bps} bps, max ${params.values.max_selected_participants}`,
      );
    }
    // Relaxed thresholds are legitimate but must be published (Go Relaxations()).
    const v = params.values;
    if (
      v.min_external_beacon_blocks < v.chain_min_external_beacon_blocks ||
      v.min_distinct_external_proposers < v.chain_min_distinct_external_proposers
    ) {
      caveats.push(
        `beacon thresholds relaxed below the chain's: applied ${v.min_external_beacon_blocks} usable blocks / ` +
          `${v.min_distinct_external_proposers} distinct proposers vs chain ${v.chain_min_external_beacon_blocks} / ` +
          `${v.chain_min_distinct_external_proposers}`,
      );
    }
  }


  // 2. Candidate set: canonical form (sorted, unique, lowercase, non-zero, capped) and the
  //    recomputed hash must match BOTH the published hash and the anchored commitment.
  const candidates = params ? parseCandidates(r['candidates'], params.values.max_candidates_per_selection) : null;
  push(
    'candidates_canonical',
    params ? candidates !== null : null,
    candidates
      ? `${candidates.length} draw id(s), strictly increasing, within the cap`
      : 'not a canonical candidate set (ordering, duplicates, case, zero id or cap)',
  );
  const setHash = candidates ? candidateSetHashV1(chainId, slotId, epoch, candidates) : null;
  const setPublishedOk = setHash ? hexEq(setHash, r['candidate_set_hash']) : null;
  const setAnchoredOk = setHash ? hexEq(setHash, anchorRec['committed_set_hash']) : null;
  push(
    'candidate_set_hash',
    setPublishedOk === null || setAnchoredOk === null ? null : setPublishedOk && setAnchoredOk,
    'recomputed from the candidates vs candidate_set_hash AND anchor.committed_set_hash',
  );

  // 3. The on-chain anchor memo (strict decode) commits the same set + params for this slot
  //    and epoch at the claimed height.
  const memo = input.anchor ? decodeAnchorMemo(input.anchor.memo) : null;
  const confirmed = toBoundedBig(anchorRec['confirmed_height']);
  if (!input.anchor) {
    push('anchor_commitment_on_chain', null, 'anchor transaction not found in the index');
  } else if (!memo) {
    push('anchor_commitment_on_chain', false, 'anchor memo is not a strict v1 commitment');
  } else {
    const ok =
      memo.slot === slotId &&
      memo.epoch === epoch &&
      (setHash === null || memo.set === setHash.toString('hex')) &&
      (pHash === null || memo.params === pHash.toString('hex')) &&
      confirmed !== null &&
      confirmed === input.anchor.height;
    push(
      'anchor_commitment_on_chain',
      ok,
      `memo at height ${input.anchor.height} commits set+params for slot ${slotId}, epoch ${epoch}`,
    );
  }

  // 4. Window placement — BEFORE any beacon work. All bounds are bounded-parsed; a failed
  //    placement stops beacon assessment entirely.
  const beaconRec = r['beacon'] === null || r['beacon'] === undefined ? null : rec(r['beacon']);
  const start = beaconRec ? toBoundedBig(beaconRec['start_height']) : null;
  const end = beaconRec ? toBoundedBig(beaconRec['end_height']) : null;
  let windowOk: boolean | null = null;
  if (params && beaconRec) {
    windowOk =
      start !== null &&
      end !== null &&
      confirmed !== null &&
      end >= start &&
      end - start + 1n === params.values.beacon_window_blocks &&
      start === confirmed + params.values.beacon_start_offset_blocks &&
      start > confirmed;
    push(
      'beacon_window_placement',
      windowOk,
      windowOk
        ? `window ${start}–${end} = anchor ${confirmed} + ${params.values.beacon_start_offset_blocks}, length ${params.values.beacon_window_blocks}`
        : 'window bounds are not exactly anchor + offset with the committed length',
    );
  }

  // A record whose candidate set or anchor commitment already failed cannot be rescued by
  // re-deriving winners, and re-hashing a large set costs real CPU — stop here (minor).
  const foundationBroken = checks.some(
    (c) => c.ok === false && ['record_shape', 'candidate_set_hash', 'anchor_commitment_on_chain', 'parameters_hash', 'parameters_valid'].includes(c.name),
  );
  if (foundationBroken) return finish();

  // 5. Expected outcome, re-derived for EVERY case (candidate count + OUR beacon assessment
  //    under the committed thresholds). The published outcome/counts/hash must match it.
  const c = candidates ? BigInt(candidates.length) : null;
  let ourBeacon: Buffer | null = null;
  let expectedOutcome: string | null = null;
  let expectedAdmissible: boolean | null = null;

  if (params && c !== null) {
    if (c < 2n && beaconRec !== null) {
      push('beacon_shape', false, `${c} candidate(s) must not carry a beacon section`);
    }
    if (c === 0n) expectedOutcome = 'NO_CANDIDATES';
    else if (c === 1n) expectedOutcome = 'SUCCESS';
    else if (windowOk && start !== null && end !== null && setHash) {
      const comp = assessBeacon(input.blocks, start, end, slotId);
      if (comp.missing > 0) {
        push(
          'beacon_recomputed',
          null,
          `${comp.missing} window block(s) lack an indexed hash or final proposer attribution`,
        );
      } else {
        expectedAdmissible =
          BigInt(comp.usable) >= params.values.min_external_beacon_blocks &&
          BigInt(comp.distinct) >= params.values.min_distinct_external_proposers;
        const countsOk =
          beaconRec !== null &&
          toBoundedBig(beaconRec['usable_blocks']) === BigInt(comp.usable) &&
          toBoundedBig(beaconRec['excluded_target_blocks']) === BigInt(comp.excludedTarget) &&
          toBoundedBig(beaconRec['unattributable_blocks']) === 0n &&
          toBoundedBig(beaconRec['distinct_external_proposers']) === BigInt(comp.distinct) &&
          beaconRec['admissible'] === expectedAdmissible;
        if (expectedAdmissible) {
          // M1's counterpart: a VALID window must carry the matching hash.
          ourBeacon = beaconHashV1(chainId, slotId, epoch, setHash, start, end, comp.entries);
          const hashOk = beaconRec !== null && hexEq(ourBeacon, beaconRec['hash']) === true;
          push(
            'beacon_recomputed',
            countsOk && hashOk,
            `admissible from ${comp.usable} usable blocks (${comp.distinct} distinct proposers) → ${ourBeacon.toString('hex').slice(0, 16)}…`,
          );
          if (!hashOk) ourBeacon = null;
          expectedOutcome = 'SUCCESS';
        } else {
          // M1: an honestly-invalid window has NO hash by the contract.
          const nullHashOk = beaconRec !== null && beaconRec['hash'] === null;
          push(
            'beacon_recomputed',
            countsOk && nullHashOk,
            `inadmissible window (${comp.usable} usable / ${comp.distinct} distinct, thresholds ${params.values.min_external_beacon_blocks}/${params.values.min_distinct_external_proposers}) — hash must be null`,
          );
          expectedOutcome = 'NO_VALID_BEACON';
        }
      }
    } else if (windowOk === false) {
      // Placement already failed → mismatch; no outcome claim either way.
    } else if (c >= 2n && beaconRec === null) {
      push('beacon_recomputed', false, 'two or more candidates require a beacon section');
    }
  }

  // B1's core: the outcome itself is a check whenever we could derive an expectation.
  if (expectedOutcome !== null) {
    push(
      'outcome_rederived',
      r['outcome'] === expectedOutcome,
      `expected ${expectedOutcome} from ${c} candidate(s)${expectedAdmissible === null ? '' : expectedAdmissible ? ' and an admissible beacon' : ' and an inadmissible beacon'}`,
    );
  } else if (params && c !== null && windowOk !== false) {
    push('outcome_rederived', null, 'outcome could not be re-derived from available data');
  }

  // 6. K, winners and the selected-ids digest — for EVERY derivable outcome. Non-SUCCESS
  //    outcomes must publish zero winners and the empty-winners digest.
  if (params && c !== null && expectedOutcome !== null) {
    const expectedK =
      expectedOutcome === 'NO_CANDIDATES'
        ? 0n
        : winnerCount(
            c,
            params.values.selection_rate_bps,
            params.values.max_selected_participants,
            params.values.max_selected_participants_per_selection,
          );
    const kOk = toBoundedBig(r['k']) === expectedK;

    let expectedWinners: Buffer[] | null = null;
    if (expectedOutcome !== 'SUCCESS') expectedWinners = [];
    else if (c === 1n) expectedWinners = candidates;
    else if (ourBeacon && candidates && setHash) {
      expectedWinners = candidates
        .map((id) => ({ id, t: ticketV1(chainId, slotId, epoch, setHash, ourBeacon as Buffer, id) }))
        .sort((a, b) => {
          const byTicket = Buffer.compare(a.t, b.t);
          return byTicket !== 0 ? byTicket : Buffer.compare(a.id, b.id);
        })
        .slice(0, Number(expectedK))
        .map((x) => x.id);
    }

    if (expectedWinners === null) {
      push('winners_redrawn', kOk ? null : false, 'beacon not reproduced — winners not re-drawn');
    } else {
      const published = Array.isArray(r['winners'])
        ? (r['winners'] as unknown[]).flatMap((w) => (typeof w === 'string' ? [w] : []))
        : [];
      const winnersOk =
        published.length === expectedWinners.length &&
        expectedWinners.every((w, i) => w.toString('hex') === published[i]);
      push(
        'winners_redrawn',
        kOk && winnersOk,
        `k=${expectedK}; ${expectedWinners.length} winner(s) expected${expectedOutcome === 'SUCCESS' ? ' in ranking order' : ' (none for ' + expectedOutcome + ')'}`,
      );
      const selOk = hexEq(
        selectedDrawIdsHashV1(chainId, slotId, epoch, expectedWinners),
        r['selected_draw_ids_hash'],
      );
      push('selected_draw_ids_hash', selOk, 'digest over the expected winners (empty digest for no winners)');
    }
  }

  return finish();
}
