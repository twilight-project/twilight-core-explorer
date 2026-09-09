'use client';

import { useRewardsEpochs, useSupply } from '@/lib/api/queries';
import { formatAmount } from '@/lib/format/amount';

// Verdict header for /economy: the latest closed epoch as the headline, supply + cumulative
// emission in the sentence. Amounts go through formatAmount (BigInt) — never Number(). The
// read-only caveat lives here in prose; the separate ClaimingCard is gone (there is no claim
// step on this chain — x/mining settlement pays participants directly).
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
      <h1 className="font-serif text-3xl tracking-tight text-text">
        {latest
          ? `Epoch ${latest.epochNumber} paid ${reward ? `${reward.display} ${reward.symbol}` : '—'}${
              latest.activeSlotCount != null ? ` to ${latest.activeSlotCount} slots` : ''
            }`
          : 'Rewards & supply'}
      </h1>
      <p className="max-w-2xl text-[15px] leading-relaxed text-text-secondary">
        {total ? (
          <>
            Total supply is <span className="font-mono text-text">{total.display}</span>{' '}
            {total.symbol}.{' '}
          </>
        ) : null}
        Rewards are released through x/mining settlement — there is no claim step, on this
        explorer or on the chain.
      </p>
    </div>
  );
}
