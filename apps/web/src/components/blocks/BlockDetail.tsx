'use client';

import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { DataList } from '@/components/detail/DataList';
import { DetailShell } from '@/components/detail/DetailShell';
import { RawSection } from '@/components/detail/RawSection';
import { OperatorLink } from '@/components/operator/OperatorLink';
import { EmptyState, ErrorState, InvalidInput, LoadingState } from '@/components/states/States';
import { BlockTxsSection } from './BlockTxsSection';
import { isNotFound } from '@/lib/api/client';
import { useBlock, useBlockRaw, useStatus } from '@/lib/api/queries';
import { deriveHeightIndexingState } from '@/lib/freshness';
import { formatHeight } from '@/lib/format/height';
import { formatAbsoluteTime } from '@/lib/format/time';
import { statusTone } from '@/lib/format/status';

export function BlockDetail({ height }: { height: string }) {
  // Client-side, string-safe malformed-height check (no Number()): a canonical positive integer
  // (rejects "0", leading zeros, and empty). The API still validates (invalid_height / not_found)
  // and ErrorState branches on error.code.
  const valid = /^[1-9]\d*$/.test(height);
  const query = useBlock(valid ? height : '');
  const status = useStatus();
  const [rawOpen, setRawOpen] = useState(false);
  const raw = useBlockRaw(valid ? height : '', rawOpen);

  if (!valid) {
    return (
      <DetailShell title={`Block ${height}`} backHref="/blocks" backLabel="Blocks">
        <InvalidInput message="Block height must be a positive integer." />
      </DetailShell>
    );
  }
  if (query.isPending) {
    return (
      <DetailShell title="Block" backHref="/blocks" backLabel="Blocks">
        <LoadingState rows={6} />
      </DetailShell>
    );
  }
  if (query.isError) {
    // During backfill a not_found for an on-chain height means "not indexed YET" — an expected
    // state worth naming, not a hard failure.
    const heightState = isNotFound(query.error)
      ? deriveHeightIndexingState(height, status.data?.data.indexer ?? null)
      : { kind: 'unknown' as const };
    return (
      <DetailShell title={`Block ${formatHeight(height)}`} backHref="/blocks" backLabel="Blocks">
        {heightState.kind === 'pending' ? (
          <EmptyState
            message={`Block ${formatHeight(height)} isn’t indexed yet — the indexer is at ${formatHeight(
              heightState.lastIndexedHeight,
            )} of ${formatHeight(heightState.latestChainHeight)}. It will appear as the backfill catches up.`}
          />
        ) : heightState.kind === 'beyond-tip' ? (
          <EmptyState
            message={`Block ${formatHeight(height)} doesn’t exist yet — the chain tip is ${formatHeight(
              heightState.latestChainHeight,
            )}.`}
          />
        ) : (
          <ErrorState error={query.error} context="Block" />
        )}
      </DetailShell>
    );
  }

  const b = query.data.data;
  const proposer = b.proposer.operatorAddress ?? b.proposer.address ?? b.proposer.rawAddress;
  return (
    <DetailShell title={`Block ${formatHeight(b.height)}`} backHref="/blocks" backLabel="Blocks">
      <Card>
        <CardBody>
          <DataList
            items={[
              { label: 'Height', value: <span className="font-mono">{formatHeight(b.height)}</span> },
              { label: 'Hash', value: <MonoCopy value={b.hash} head={16} tail={10} label="block hash" /> },
              { label: 'Time', value: formatAbsoluteTime(b.time) },
              { label: 'Chain', value: b.chainId ?? '—' },
              { label: 'Transactions', value: <span className="font-mono">{b.txCount}</span> },
              {
                label: 'Proposer',
                value: b.proposer.operatorAddress ? (
                  <OperatorLink operatorAddress={b.proposer.operatorAddress} />
                ) : (
                  <MonoCopy value={proposer} label="proposer" />
                ),
              },
              {
                label: 'Attribution',
                value: b.proposer.attributionStatus ? (
                  <Badge tone={statusTone(b.proposer.attributionStatus)}>{b.proposer.attributionStatus}</Badge>
                ) : (
                  '—'
                ),
              },
              { label: 'App hash', value: <MonoCopy value={b.appHash} label="app hash" /> },
              { label: 'Last block hash', value: <MonoCopy value={b.lastBlockHash} label="last block hash" /> },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={Boxes} iconTone="infra" title="Transactions in this block" />
        <CardBody>
          <BlockTxsSection height={b.height} />
        </CardBody>
      </Card>

      <RawSection expanded={rawOpen} onToggle={() => setRawOpen((o) => !o)} query={raw} />
    </DetailShell>
  );
}
