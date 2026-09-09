'use client';

import { Activity, CircleAlert, CircleX, Layers, Stethoscope } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState } from '@/components/states/States';
import { useDecodeFailures, useProjections, useStatus } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { formatRelativeTime } from '@/lib/format/time';
import { statusTone } from '@/lib/format/status';

// Operational diagnostics surface: indexer projection health and freshness. Read-only.
// (Renamed from the old "/api" route — this was never a public API reference; that lives at the
// Scalar /docs page.) Airy redesign — summary-first cards over the existing projection + decode tables.
export default function DiagnosticsPage() {
  const query = useProjections();
  const decodeFailures = useDecodeFailures();
  const status = useStatus();

  // Summary is derived from the same real queries — no extra fetch. Sums are over bounded integers.
  const projList = query.data?.data;
  const projCount = projList ? projList.length : undefined;
  const projFailures = projList
    ? projList.reduce((sum, p) => sum + p.unresolvedFailures.count, 0)
    : undefined;
  const decodeCount = decodeFailures.data ? decodeFailures.data.data.length : undefined;
  const indexerStatus = status.data?.data.indexer?.status;
  const build = status.data?.data.build;
  const chainId = status.data?.data.chainId;
  const dash = (pending: boolean) => (pending ? '…' : '—');

  return (
    <div className="space-y-section">
      <PageHeader
        icon={Stethoscope}
        iconTone="infra"
        eyebrow="Diagnostics"
        title="Indexer & projection diagnostics"
        sub="Projection cursors, status, unresolved projection failures, and decode failures — the operational health of the pipeline behind this explorer. Read-only."
      />

      <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
        <KpiCard
          icon={Activity}
          iconTone="infra"
          label="Indexer status"
          value={indexerStatus ?? dash(status.isPending)}
          mono={false}
          deltaTone={statusTone(indexerStatus)}
        />
        <KpiCard
          icon={Layers}
          iconTone="infra"
          label="Projections tracked"
          value={projCount === undefined ? dash(query.isPending) : projCount}
        />
        <KpiCard
          icon={CircleX}
          iconTone="risk"
          label="Projection failures"
          value={projFailures === undefined ? dash(query.isPending) : projFailures}
          deltaTone={projFailures ? 'danger' : 'success'}
          delta={projFailures === undefined ? undefined : projFailures ? 'unresolved' : 'clean'}
          sub="unresolved"
        />
        <KpiCard
          icon={CircleAlert}
          iconTone="risk"
          label="Decode failures"
          value={decodeCount === undefined ? dash(decodeFailures.isPending) : decodeCount}
          deltaTone={decodeCount ? 'warning' : 'success'}
          sub="latest unresolved"
        />
      </div>

      {/* Provenance: what /status already returns, rendered — a read-only product's provenance
          is part of its trust. */}
      <Card>
        <CardHeader icon={Layers} iconTone="infra" title="Provenance" />
        <CardBody>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-text-muted">Chain</div>
              <div className="mt-1 font-mono text-text">{chainId ?? dash(status.isPending)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-text-muted">Version</div>
              <div className="mt-1 font-mono text-text">{build?.version ?? dash(status.isPending)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-text-muted">Git sha</div>
              <div className="mt-1 font-mono text-text">{build?.gitSha ? build.gitSha.slice(0, 12) : dash(status.isPending)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-text-muted">Built at</div>
              <div className="mt-1 font-mono text-text">{build?.builtAt ?? dash(status.isPending)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-text-muted">Environment</div>
              <div className="mt-1 font-mono text-text">{build?.environment ?? dash(status.isPending)}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={Activity} iconTone="infra" title="Projections" />
        <CardBody>
          <QueryBoundary query={query} context="Projections" loadingRows={5}>
            {(res) =>
              res.data.length === 0 ? (
                <EmptyState message="No projections reported." />
              ) : (
                <Table
                  caption="Projection cursors"
                  head={
                    <>
                      <Th>Projection</Th>
                      <Th>Status</Th>
                      <Th>Height</Th>
                      <Th>Updated</Th>
                      <Th>Failures</Th>
                    </>
                  }
                >
                  {res.data.map((p) => (
                    <Tr key={p.projectionName}>
                      <Td mono>{p.projectionName}</Td>
                      <Td>
                        <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      </Td>
                      <Td mono>{formatHeight(p.lastProjectedHeight)}</Td>
                      <Td>{formatRelativeTime(p.updatedAt)}</Td>
                      <Td mono>
                        {p.unresolvedFailures.count > 0 ? (
                          <Badge tone="danger">{p.unresolvedFailures.count}</Badge>
                        ) : (
                          <span className="text-text-muted">0</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Table>
              )
            }
          </QueryBoundary>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={CircleX} iconTone="risk" title="Decode failures" />
        <CardBody>
          <QueryBoundary query={decodeFailures} context="Decode failures" loadingRows={3}>
            {(res) =>
              res.data.length === 0 ? (
                <EmptyState message="No unresolved decode failures." />
              ) : (
                <Table
                  caption="Decode failures"
                  head={
                    <>
                      <Th>Height</Th>
                      <Th>Kind</Th>
                      <Th>Type</Th>
                      <Th>Error</Th>
                      <Th>When</Th>
                    </>
                  }
                >
                  {res.data.map((f) => (
                    <Tr key={f.id}>
                      <Td mono>{formatHeight(f.height)}</Td>
                      <Td>
                        <Badge tone="warning">{f.failureKind}</Badge>
                      </Td>
                      <Td mono>{f.typeUrl ?? f.eventType ?? '—'}</Td>
                      <Td>{f.decodeError}</Td>
                      <Td>{formatRelativeTime(f.createdAt)}</Td>
                    </Tr>
                  ))}
                </Table>
              )
            }
          </QueryBoundary>
        </CardBody>
      </Card>
    </div>
  );
}
