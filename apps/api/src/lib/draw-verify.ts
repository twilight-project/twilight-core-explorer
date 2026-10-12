import { createHash } from 'node:crypto';

// Independent re-derivation of a published selection draw (twilight-minis selectionv1).
// The normative description is twilight-minis internal/selectionv1 (hash.go, draw.go,
// beacon.go) and docs/verifying-a-draw.md; this is a faithful TypeScript port. Everything
// here consumes ONLY the operator's published record plus rows this explorer indexed from
// the chain (anchor tx memo + height, block-ID hashes, proposer→slot attribution) — so a
// green result means the chain itself confirms the draw, not the operator's word.
//
// Canon framing (§36): SHA-256 over raw concatenated bytes. Integers are U64 big-endian;
// the chain id is U16BE(len) || utf8; draw ids / hashes are 32 raw bytes (64 lowercase hex
// in JSON). No separators, no JSON inside digests.

const DOMAIN_CANDIDATE_SET = 'TWILIGHT/TOKENDROP/CANDIDATE-SET/V1';
const DOMAIN_BEACON = 'TWILIGHT/TOKENDROP/BEACON/V1';
const DOMAIN_TICKET = 'TWILIGHT/TOKENDROP/TICKET/V1';
const DOMAIN_SELECTED = 'TWILIGHT/PARTICIPANT-SELECTION/SELECTED-DRAW-IDS/V1';
const PARAMS_VERSION_TAG = 'TWILIGHT_MINIS_DRAW_PARAMETERS_HASH_V1';

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
/** 64 hex chars → 32 bytes; accepts either case (our DB stores block hashes uppercase). */
function hex32(s: unknown): Buffer | null {
  if (typeof s !== 'string' || !/^[0-9a-fA-F]{64}$/.test(s)) return null;
  return Buffer.from(s.toLowerCase(), 'hex');
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

// The params digest uses a different framing (internal/preimage): each field is
// U32BE(len) || bytes, numbers as base-10 ASCII, the version tag first, names never hashed.
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

export function paramsHashV1(params: Record<string, unknown>): Buffer | null {
  const field = (v: string) => {
    const b = Buffer.from(v, 'ascii');
    return Buffer.concat([u32be(b.length), b]);
  };
  const parts: Buffer[] = [field(PARAMS_VERSION_TAG)];
  for (const name of PARAM_FIELD_ORDER) {
    const v = params[name];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null;
    parts.push(field(String(v)));
  }
  const excl = params['exclude_target_slot_proposals'];
  if (typeof excl !== 'boolean') return null;
  parts.push(field(excl ? '1' : '0'));
  return sha256(...parts);
}

export interface WindowBlock {
  height: bigint;
  /** Block-ID hash hex (either case) or null when unindexed. */
  hash: string | null;
  /** Attributed proposer slot, null = unattributable. */
  proposerSlotId: bigint | null;
}

export interface BeaconComputation {
  entries: { height: bigint; slot: bigint; hash: Buffer }[];
  usable: number;
  distinct: number;
  excludedTarget: number;
  unattributable: number;
  missing: number;
}

export function assessBeacon(
  blocks: WindowBlock[],
  startHeight: bigint,
  endHeight: bigint,
  targetSlot: bigint,
): BeaconComputation {
  const byHeight = new Map(blocks.map((b) => [b.height, b]));
  const entries: BeaconComputation['entries'] = [];
  let excludedTarget = 0;
  let unattributable = 0;
  let missing = 0;
  for (let h = startHeight; h <= endHeight; h++) {
    const b = byHeight.get(h);
    const hash = b ? hex32(b.hash) : null;
    if (!b || hash === null) {
      missing++;
      continue;
    }
    if (b.proposerSlotId === null) unattributable++;
    else if (b.proposerSlotId === targetSlot) excludedTarget++;
    else entries.push({ height: h, slot: b.proposerSlotId, hash });
  }
  const distinct = new Set(entries.map((e) => e.slot.toString())).size;
  return { entries, usable: entries.length, distinct, excludedTarget, unattributable, missing };
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

/** K = min(max(1, rate_k), M, P, floor(C/2)) with rate_k in integer arithmetic; C=0→0, C=1→1. */
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
}

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}
function toBig(v: unknown): bigint | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

/**
 * Re-derive the whole draw from the published record + what this explorer indexed from the
 * chain. `anchor` is the indexed anchor transaction (memo + height); `blocks` must cover the
 * beacon window (missing/pruned rows degrade checks to null, never to a false).
 */
export function verifyDraw(input: {
  chainId: string;
  slotId: bigint;
  epoch: bigint;
  record: unknown;
  anchor: { memo: string | null; height: bigint } | null;
  blocks: WindowBlock[];
}): DrawVerification {
  const { chainId, slotId, epoch } = input;
  const r = rec(input.record);
  const checks: DrawCheck[] = [];
  const push = (name: string, ok: boolean | null, detail: string) =>
    checks.push({ name, ok, detail });

  const candidates = Array.isArray(r['candidates'])
    ? (r['candidates'] as unknown[]).map(hex32)
    : [];
  const candBufs = candidates.flatMap((c) => (c ? [c] : []));
  const candidatesParsed = candBufs.length === (Array.isArray(r['candidates']) ? (r['candidates'] as unknown[]).length : -1);

  // 1. Candidate-set hash recomputed from the published candidate list.
  const setHash = candidatesParsed ? candidateSetHashV1(chainId, slotId, epoch, candBufs) : null;
  const recordSet = typeof r['candidate_set_hash'] === 'string' ? r['candidate_set_hash'] : null;
  push(
    'candidate_set_hash',
    setHash && recordSet ? setHash.toString('hex') === recordSet : null,
    setHash
      ? `sha256 over ${candBufs.length} draw id(s) → ${setHash.toString('hex').slice(0, 16)}…`
      : 'candidates could not be parsed',
  );

  // 2. Parameters hash recomputed from the published parameters.
  const pHash = paramsHashV1(rec(r['parameters']));
  const anchorRec = rec(r['anchor']);
  push(
    'parameters_hash',
    pHash && typeof anchorRec['committed_params_hash'] === 'string'
      ? pHash.toString('hex') === anchorRec['committed_params_hash']
      : null,
    pHash ? `recomputed from the record's parameters` : 'parameters incomplete',
  );

  // 3. The on-chain anchor memo commits the same set + params, for this slot and epoch,
  //    at the height the record claims — BEFORE the beacon window existed.
  let memoOk: boolean | null = null;
  let memoDetail = 'anchor transaction not found in the index';
  if (input.anchor) {
    try {
      const memo = rec(JSON.parse(input.anchor.memo ?? ''));
      const heightOk = toBig(anchorRec['confirmed_height']) === input.anchor.height;
      memoOk =
        memo['v'] === 1 &&
        toBig(memo['slot']) === slotId &&
        toBig(memo['epoch']) === epoch &&
        typeof memo['set'] === 'string' &&
        memo['set'] === recordSet &&
        (setHash === null || memo['set'] === setHash.toString('hex')) &&
        (pHash === null || memo['params'] === pHash.toString('hex')) &&
        heightOk;
      memoDetail = `memo at height ${input.anchor.height} commits set+params for slot ${slotId}, epoch ${epoch}`;
    } catch {
      memoOk = false;
      memoDetail = 'anchor memo is not the expected JSON commitment';
    }
  }
  push('anchor_commitment_on_chain', memoOk, memoDetail);

  const params = rec(r['parameters']);
  const offset = toBig(params['beacon_start_offset_blocks']);
  const windowLen = toBig(params['beacon_window_blocks']);
  const beacon = r['beacon'] === null ? null : rec(r['beacon']);
  const start = beacon ? toBig(beacon['start_height']) : null;
  const end = beacon ? toBig(beacon['end_height']) : null;
  const confirmed = toBig(anchorRec['confirmed_height']);

  // 4. Window placement: exactly anchor + offset, declared length, strictly after the anchor.
  if (beacon && start !== null && end !== null && confirmed !== null && offset !== null && windowLen !== null) {
    const ok = start === confirmed + offset && end === start + windowLen - 1n && start > confirmed;
    push(
      'beacon_window_placement',
      ok,
      `window ${start}–${end} = anchor ${confirmed} + ${offset}, length ${windowLen}`,
    );
  } else if (beacon) {
    push('beacon_window_placement', null, 'window fields incomplete');
  }

  // 5. Beacon recomputed from OUR indexed blocks (block-id hashes + proposer attribution).
  let ourBeacon: Buffer | null = null;
  if (beacon && start !== null && end !== null && setHash) {
    const comp = assessBeacon(input.blocks, start, end, slotId);
    if (comp.missing > 0) {
      push(
        'beacon_recomputed',
        null,
        `${comp.missing} window block(s) not in this explorer's index`,
      );
    } else {
      ourBeacon = beaconHashV1(chainId, slotId, epoch, setHash, start, end, comp.entries);
      const recordedHash = typeof beacon['hash'] === 'string' ? beacon['hash'] : null;
      const countsOk =
        comp.usable === beacon['usable_blocks'] &&
        comp.excludedTarget === beacon['excluded_target_blocks'] &&
        comp.unattributable === beacon['unattributable_blocks'] &&
        comp.distinct === beacon['distinct_external_proposers'];
      const hashOk = recordedHash !== null && ourBeacon.toString('hex') === recordedHash;
      push(
        'beacon_recomputed',
        countsOk && hashOk,
        `from ${comp.usable} usable blocks (${comp.excludedTarget} target-proposed excluded, ${comp.unattributable} unattributable) → ${ourBeacon.toString('hex').slice(0, 16)}…`,
      );
      if (!hashOk) ourBeacon = null;
    }
  }

  // 6. Winners re-drawn: K from the published parameters, tickets from (set, beacon, draw id),
  //    rank by (ticket, draw id), take K — must equal the published winners exactly, in order.
  const recordWinners = Array.isArray(r['winners'])
    ? (r['winners'] as unknown[]).flatMap((w) => (typeof w === 'string' ? [w] : []))
    : [];
  const rate = toBig(params['selection_rate_bps']);
  const maxSel = toBig(params['max_selected_participants']);
  const maxPer = toBig(params['max_selected_participants_per_selection']);
  if (r['outcome'] === 'SUCCESS' && setHash && rate !== null && maxSel !== null && maxPer !== null) {
    const c = BigInt(candBufs.length);
    const k = winnerCount(c, rate, maxSel, maxPer);
    const kOk = toBig(r['k']) === k;
    let winnersOk: boolean | null = null;
    let winnersDetail = '';
    let rankedWinners: Buffer[] | null = null;
    if (c === 1n) {
      rankedWinners = candBufs;
      winnersOk = recordWinners.length === 1 && recordWinners[0] === candBufs[0]?.toString('hex');
      winnersDetail = 'single candidate wins without a beacon';
    } else if (ourBeacon) {
      const ranked = candBufs
        .map((id) => ({ id, t: ticketV1(chainId, slotId, epoch, setHash, ourBeacon as Buffer, id) }))
        .sort((a, b) => {
          const byTicket = Buffer.compare(a.t, b.t);
          return byTicket !== 0 ? byTicket : Buffer.compare(a.id, b.id);
        });
      rankedWinners = ranked.slice(0, Number(k)).map((x) => x.id);
      winnersOk =
        recordWinners.length === rankedWinners.length &&
        rankedWinners.every((w, i) => w.toString('hex') === recordWinners[i]);
      winnersDetail = `tickets ranked over ${c} candidates, first ${k} taken`;
    } else {
      winnersDetail = 'beacon not independently reproduced, winners not re-drawn';
    }
    push('winners_redrawn', kOk === false ? false : winnersOk, `k=${k}${kOk ? '' : ' (record disagrees)'} — ${winnersDetail}`);

    // 7. The published selected-draw-ids digest over the winners, in rank order.
    const selOk =
      rankedWinners !== null && typeof r['selected_draw_ids_hash'] === 'string'
        ? selectedDrawIdsHashV1(chainId, slotId, epoch, rankedWinners).toString('hex') ===
          r['selected_draw_ids_hash']
        : null;
    push('selected_draw_ids_hash', selOk, 'digest over the winners in ranking order');
  }

  const anyFalse = checks.some((c) => c.ok === false);
  const allTrue = checks.length > 0 && checks.every((c) => c.ok === true);
  return { result: anyFalse ? 'mismatch' : allTrue ? 'verified' : 'unverifiable', checks };
}
