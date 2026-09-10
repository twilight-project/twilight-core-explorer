'use client';

import { useRewardsEpochs, useSupply } from '@/lib/api/queries';
import { formatAmount } from '@/lib/format/amount';

// Quiet header for /economy (14a feedback): a plain h1 with the latest epoch and supply as ONE
// muted line, not a shouting sentence. Amounts go through formatAmount (BigInt) — never
// Number(). The no-claim-step caveat moved to the surfaces that show rewards (account page,
// entitlements) rather than the destination header.
export function EconomyVerdict() {
  const epochs = useRewardsEpochs();
  const supply = useSupply();

  const latest = epochs.data?.pages[0]?.data[0];
  const coins = supply.data?.data.supply ?? [];
  const native = coins.find((c) => c.denom === 'utwlt') ?? coins[0];

  const reward =
    latest?.totalReward != null ? formatAmount(latest.totalReward, latest.denom ?? 'utwlt') : null;
  const total = native ? formatAmount(native.amount, native.denom) : null;

  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="font-serif text-3xl text-text">Economy</h1>
      <p className="max-w-2xl text-sm text-text-muted">
        {latest ? (
          <>
            Epoch <span className="font-mono text-text-secondary">{latest.epochNumber}</span> paid{' '}
            <span className="font-mono text-text-secondary">
              {reward ? `${reward.display} ${reward.symbol}` : '—'}
            </span>
            {latest.activeSlotCount != null ? ` to ${latest.activeSlotCount} slots` : ''}
          </>
        ) : (
          'Rewards & supply'
        )}
        {total ? (
          <>
            {' · '}total supply{' '}
            <span className="font-mono text-text-secondary">{total.display}</span> {total.symbol}
          </>
        ) : null}
      </p>
    </div>
  );
}
