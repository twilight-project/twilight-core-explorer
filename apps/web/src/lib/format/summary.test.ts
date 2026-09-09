import { describe, expect, it } from 'vitest';
import { summarizeMessageTypes, summarizeTxDetail, txParties } from './summary';

describe('summarizeMessageTypes (list rows: types only, no amounts)', () => {
  it('maps known type URLs to phrases', () => {
    expect(summarizeMessageTypes(['/cosmos.bank.v1beta1.MsgSend'])).toBe('Sent tokens');
    expect(summarizeMessageTypes(['/twilight.mining.v1.MsgFinalizeSettlement'])).toBe(
      'Finalized a settlement',
    );
    expect(summarizeMessageTypes(['/twilight.coreslot.v1.MsgRotateConsensusKey'])).toBe(
      'Rotated a consensus key',
    );
  });

  it('falls back to the short type name for unknown types', () => {
    expect(summarizeMessageTypes(['/twilight.future.v1.MsgDoNewThing'])).toBe('DoNewThing');
  });

  it('summarizes multi-message txs as "+n more"', () => {
    expect(
      summarizeMessageTypes([
        '/cosmos.bank.v1beta1.MsgSend',
        '/cosmos.bank.v1beta1.MsgSend',
        '/twilight.mining.v1.MsgFinalizeSettlement',
      ]),
    ).toBe('Sent tokens +2 more');
  });
});

describe('summarizeTxDetail (decoded messages: real amounts, BigInt-safe)', () => {
  it('renders a MsgSend amount in TWLT', () => {
    expect(
      summarizeTxDetail([
        {
          typeUrl: '/cosmos.bank.v1beta1.MsgSend',
          decodedJson: { amount: [{ denom: 'utwlt', amount: '12500000' }] },
        },
      ]),
    ).toBe('Sent 12.5 TWLT');
  });

  it('sums settlement chunk payouts without precision loss past 2^53', () => {
    expect(
      summarizeTxDetail([
        {
          typeUrl: '/twilight.mining.v1.MsgSubmitSettlementChunk',
          decodedJson: {
            slot_id: '1',
            epoch: '62',
            payouts: [
              { recipient: 'a', amount: '9007199254740993' },
              { recipient: 'b', amount: '1' },
            ],
          },
        },
      ]),
    ).toBe('Paid 9,007,199,254.740994 TWLT to 2 participants · slot 1 epoch 62');
  });

  it('never invents an amount when the decode is missing — falls back to the phrase', () => {
    expect(summarizeTxDetail([{ typeUrl: '/cosmos.bank.v1beta1.MsgSend' }])).toBe('Sent tokens');
  });
});

describe('txParties', () => {
  it('extracts from/to for a transfer', () => {
    expect(
      txParties(
        [
          {
            typeUrl: '/cosmos.bank.v1beta1.MsgSend',
            decodedJson: { from_address: 'twilight1from', to_address: 'twilight1to' },
          },
        ],
        [],
      ),
    ).toEqual({ from: 'twilight1from', to: 'twilight1to' });
  });

  it('falls back to the message signer, then the tx signer list', () => {
    expect(
      txParties(
        [{ typeUrl: '/twilight.mining.v1.MsgFinalizeSettlement', decodedJson: { signer: 'twilight1s' } }],
        [],
      ),
    ).toEqual({ signer: 'twilight1s' });
    expect(txParties([{ typeUrl: '/x.y.MsgZ' }], ['twilight1fallback'])).toEqual({
      signer: 'twilight1fallback',
    });
  });
});
