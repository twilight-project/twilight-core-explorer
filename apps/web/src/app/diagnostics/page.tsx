'use client';

import { QueryBoundary } from '@/components/QueryBoundary';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState } from '@/components/states/States';
import { useDecodeFailures, useProjections } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { formatRelativeTime } from '@/lib/format/time';
import { statusTone } from '@/lib/format/status';

// Operational diagnostics surface: indexer projection health and freshness. Read-only.
// (Renamed from the old "/api" route — this was never a public API reference; that lives at the
// Scalar /docs page. Summary-first redesign lands when the Diagnostics page is rebuilt in the batch.)
export default function DiagnosticsPage() {
  const query = useProjections();
  const decodeFailures = useDecodeFailures();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-text">Diagnostics</h1>
        <p className="mt-1 text-sm text-text-muted">
          Indexer projection cursors, status, unresolved projection failures, and decode failures —
          the operational health of the pipeline behind this explorer.
        </p>
      </div>
      <Card>
        <CardHeader title="Projections" />
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
        <CardHeader title="Decode failures" />
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
