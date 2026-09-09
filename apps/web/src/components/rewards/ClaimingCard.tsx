import { HandCoins } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

/**
 * Non-actionable "how rewards are released" info card.
 *
 * The explorer performs NO reward action. This card MUST stay non-actionable: no button, no
 * disabled button, no wallet prompt, no dApp link, no "claim now"/"settle now" language.
 *
 * Content note (devnet-2 V2 switchover): this card used to document a `twilightd rewards claim`
 * command. The chain DELETED manual claiming (twilight-core aa568f61) — that command no longer
 * exists, so showing it was actively misleading. Release now happens through x/mining
 * settlement, driven by each slot's settlement address.
 */
export function ClaimingCard() {
  return (
    <Card>
      <CardHeader icon={HandCoins} iconTone="rewards" title="How rewards are released" />
      <CardBody>
        <p className="text-sm text-text-muted">
          There is no claim action — on this explorer or on the chain. When a reward epoch closes,
          each active CoreSlot receives an immutable <span className="font-medium">entitlement</span>.
          That entitlement is released through <span className="font-medium">x/mining settlement</span>:
          the slot&apos;s settlement address submits chunks of participant payouts, and finalizing
          the settlement pays any remainder to the operator&apos;s payout address.
        </p>
        <p className="mt-3 text-sm text-text-muted">
          This page shows the resulting entitlements and settlements as observed projections.
        </p>
      </CardBody>
    </Card>
  );
}
