import { describe, expect, it } from 'vitest';
import {
  CORESLOT_STATUS_OPTIONS,
  TX_STATUS_OPTIONS,
  TX_TYPE_GROUP_OPTIONS,
  coerceStatus,
} from './status-filters';

describe('status filter enums', () => {
  // The API filter is a case-sensitive exact match; option values MUST equal the stored enum, or the
  // filter silently returns nothing. CoreSlot status is UPPERCASE (indexer); tx status is lowercase.
  it('CoreSlot values are the UPPERCASE stored enum; tx values are lowercase', () => {
    expect(CORESLOT_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'ACTIVE',
      'PENDING',
      'INACTIVE',
      'SUSPENDED',
      'REMOVED',
    ]);
    expect(TX_STATUS_OPTIONS.map((o) => o.value)).toEqual(['success', 'failed']);
  });
});

describe('coerceStatus (URL ingress boundary)', () => {
  it('normalizes a lowercase URL value to the canonical stored enum (NOT passed through raw)', () => {
    // /coreslots?status=active must reach the API as ACTIVE, never lowercase 'active'.
    expect(coerceStatus('active', CORESLOT_STATUS_OPTIONS)).toBe('ACTIVE');
    expect(coerceStatus('Active', CORESLOT_STATUS_OPTIONS)).toBe('ACTIVE');
    expect(coerceStatus('REMOVED', CORESLOT_STATUS_OPTIONS)).toBe('REMOVED');
  });

  it('normalizes tx status case-insensitively', () => {
    expect(coerceStatus('SUCCESS', TX_STATUS_OPTIONS)).toBe('success');
    expect(coerceStatus('failed', TX_STATUS_OPTIONS)).toBe('failed');
  });

  it('drops unknown / cross-list / empty values to undefined (= "All")', () => {
    expect(coerceStatus('bogus', CORESLOT_STATUS_OPTIONS)).toBeUndefined();
    expect(coerceStatus('success', CORESLOT_STATUS_OPTIONS)).toBeUndefined(); // tx value on coreslots
    expect(coerceStatus('active', TX_STATUS_OPTIONS)).toBeUndefined(); // coreslot value on txs
    expect(coerceStatus('', CORESLOT_STATUS_OPTIONS)).toBeUndefined();
    expect(coerceStatus(undefined, TX_STATUS_OPTIONS)).toBeUndefined();
  });
});

describe('TX_TYPE_GROUP_OPTIONS ↔ API enum lockstep', () => {
  // These options are the client half of a CLOSED server-side enum. If the API gains a module
  // family and this list does not, the filter silently cannot reach it; if this list gains one
  // the API does not have, selecting it 400s. devnet-2 shipped x/mining and hit the first case.
  it('covers exactly the module families the API accepts', () => {
    expect(TX_TYPE_GROUP_OPTIONS.map((o) => o.value).sort()).toEqual([
      'bank',
      'coreslot',
      'mining',
      'rewards',
    ]);
  });
});
