'use client';

import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { DetailShell } from '@/components/detail/DetailShell';
import { DataList } from '@/components/detail/DataList';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, Th, Tr, Td } from '@/components/ui/Table';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { QueryBoundary } from '@/components/QueryBoundary';
import { InvalidInput } from '@/components/states/States';
import { formatHeight } from '@/lib/format/height';
import { formatAmount } from '@/lib/format/amount';
import { shortenMiddle } from '@/lib/format/address';
import { useSettlement } from '@/lib/api/queries';

function reasonLabel(reason: string | null): string {
  if (!reason) return '—';
  return reason.replace(/^SETTLEMENT_FINALIZATION_REASON_/, '').toLowerCase().replace(/_/g, ' ');
}

/**
 * One settlement: whether it closed, how, and exactly which addresses were paid what.
 *
 * The payout lines come from the transaction bodies (the chunk event carries only aggregates),
 * so this is the authoritative answer to "who got rewards from this slot for this epoch".
 */
export function SettlementDetail({ slotId, epoch }: { slotId: string; epoch: string }) {
  const valid = /^\d+$/.test(slotId) && /^\d+$/.test(epoch);
  const query = useSettlement(valid ? slotId : '', valid ? epoch : '');

  if (!valid) {
    return (
      <DetailShell
        title="Settlement"
        backHref="/validators?tab=registry"
        backLabel="CoreSlots"
      >
        <InvalidInput message="Slot id and epoch must both be numeric." />
      </DetailShell>
    );
  }

  return (
    <DetailShell
      title={`Settlement · slot ${slotId} · epoch ${epoch}`}
      backHref={`/coreslots/${encodeURIComponent(slotId)}`}
      backLabel={`CoreSlot ${slotId}`}
    >
      <QueryBoundary query={query} context="Settlement">
        {(res) => {
          const s = res.data;
          const paid = formatAmount(s.totalPaid, s.denom);
          const remainder = s.releasedRemainder
            ? formatAmount(s.releasedRemainder, s.denom)
            : null;
          return (
            <div className="space-y-6">
              <Card>
                <CardHeader icon={Landmark} iconTone="rewards" title="Settlement" />
                <CardBody>
                  <DataList
                    items={[
                      {
                        label: 'Status',
                        value: s.settled ? (
                          <Badge tone="success">settled</Badge>
                        ) : (
                          <Badge tone="warning">open</Badge>
                        ),
                      },
                      { label: 'How it closed', value: reasonLabel(s.finalizationReason) },
                      {
                        label: 'CoreSlot',
                        value: (
                          <Link
                            href={`/coreslots/${encodeURIComponent(s.slotId)}`}
                            className="text-primary hover:text-primary-light"
                          >
                            {s.slotId}
                          </Link>
                        ),
                      },
                      { label: 'Epoch', value: <span className="font-mono">{s.epochNumber}</span> },
                      {
                        label: 'Paid to participants',
                        value: <span className="font-mono">{`${paid.display} ${paid.symbol}`}</span>,
                      },
                      {
                        label: 'Remainder to operator',
                        value: <span className="font-mono">{remainder ? `${remainder.display} ${remainder.symbol}` : '—'}</span>,
                      },
                      { label: 'Recipients', value: <span className="font-mono">{String(s.payoutCount)}</span> },
                      { label: 'Chunks submitted', value: <span className="font-mono">{String(s.chunkCount)}</span> },
                      {
                        label: 'Finalized at height',
                        value: <span className="font-mono">{s.finalizedHeight ? formatHeight(s.finalizedHeight) : '—'}</span>,
                      },
                    ]}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader icon={Landmark} iconTone="rewards" title="Recipients" />
                <CardBody>
                  {s.payouts.length === 0 ? (
                    <p className="text-sm text-text-muted">
                      No recipient payouts recorded for this settlement.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table
                        caption={`Recipients paid in slot ${slotId} epoch ${epoch}`}
                        head={(
                          <tr>
                            <Th>Recipient</Th>
                            <Th>Amount</Th>
                            <Th>Chunk</Th>
                            <Th>Height</Th>
                            <Th>Tx</Th>
                          </tr>
                        )}
                      >
                        <>
                          {s.payouts.map((p) => {
                            const a = formatAmount(p.amount, p.denom);
                            return (
                              <Tr key={p.id}>
                                <Td>
                                  <Link
                                    href={`/accounts/${encodeURIComponent(p.recipient)}`}
                                    className="font-mono text-primary hover:text-primary-light"
                                    title={p.recipient}
                                  >
                                    {shortenMiddle(p.recipient)}
                                  </Link>
                                </Td>
                                <Td mono>{`${a.display} ${a.symbol}`}</Td>
                                <Td mono>{p.chunkIndex}</Td>
                                <Td mono>{formatHeight(p.height)}</Td>
                                <Td>
                                  <Link
                                    href={`/txs/${encodeURIComponent(p.txHash)}`}
                                    className="font-mono text-primary hover:text-primary-light"
                                    title={p.txHash}
                                  >
                                    {shortenMiddle(p.txHash)}
                                  </Link>
                                </Td>
                              </Tr>
                            );
                          })}
                        </>
                      </Table>
                    </div>
                  )}
                </CardBody>
              </Card>

              {s.chunks.length > 0 ? (
                <Card>
                  <CardHeader icon={Landmark} iconTone="rewards" title="Chunks" />
                  <CardBody>
                    <div className="overflow-x-auto">
                      <Table
                        caption={`Chunks submitted for slot ${slotId} epoch ${epoch}`}
                        head={(
                          <tr>
                            <Th>Chunk</Th>
                            <Th>Recipients</Th>
                            <Th>Total</Th>
                            <Th>Height</Th>
                            <Th>Tx</Th>
                          </tr>
                        )}
                      >
                        <>
                          {s.chunks.map((c) => {
                            const a = c.chunkTotal ? formatAmount(c.chunkTotal, s.denom) : null;
                            return (
                              <Tr key={c.chunkIndex}>
                                <Td mono>{c.chunkIndex}</Td>
                                <Td mono>{c.recipientCount ?? '—'}</Td>
                                <Td mono>{a ? `${a.display} ${a.symbol}` : '—'}</Td>
                                <Td mono>{formatHeight(c.height)}</Td>
                                <Td>
                                  <MonoCopy value={c.txHash} label="tx hash" />
                                </Td>
                              </Tr>
                            );
                          })}
                        </>
                      </Table>
                    </div>
                  </CardBody>
                </Card>
              ) : null}
            </div>
          );
        }}
      </QueryBoundary>
    </DetailShell>
  );
}
