'use client';

import Link from 'next/link';
import { QueryBoundary } from '@/components/QueryBoundary';
import { EmptyState } from '@/components/states/States';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { OperatorLink } from '@/components/operator/OperatorLink';
import { useCoreSlotHealthFanout, useCoreSlots } from '@/lib/api/queries';

function bpsToPercent(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '—';
  return `${(bps / 100).toFixed(1)}%`;
}

// The /validators Active tab: one row per ACTIVE slot with a signed-last-100 bar (the health
// policy's primary window), uptime and power. Health arrives via the bounded per-slot fan-out;
// a failed per-slot fetch renders "—" for that row, never fails the table.
export function ActiveSlotsTable() {
  const slotsQuery = useCoreSlots();
  const active = (slotsQuery.data?.data ?? []).filter((s) => s.status === 'ACTIVE');
  const healthQuery = useCoreSlotHealthFanout(active.map((s) => s.slotId));
  const healthBySlot = new Map((healthQuery.data ?? []).map((h) => [h.slotId, h.health]));

  return (
    <QueryBoundary query={slotsQuery} context="CoreSlots" loadingRows={5}>
      {() =>
        active.length === 0 ? (
          <EmptyState message="No active CoreSlots indexed yet." />
        ) : (
          <Table
            caption="Active CoreSlots"
            head={
              <>
                <Th>Slot</Th>
                <Th>Operator</Th>
                <Th>Signed, last 100 blocks</Th>
                <Th>Uptime</Th>
                <Th>Power</Th>
              </>
            }
          >
            {active.map((s) => {
              const h = healthBySlot.get(s.slotId) ?? null;
              const pct = h?.uptimeBps != null ? Math.min(100, h.uptimeBps / 100) : null;
              const barColor =
                h == null
                  ? 'bg-border-light'
                  : h.healthStatus === 'healthy'
                    ? 'bg-accent-green'
                    : h.healthStatus === 'degraded'
                      ? 'bg-accent-yellow'
                      : 'bg-accent-red';
              return (
                <Tr key={s.slotId}>
                  <Td mono>
                    <Link
                      href={`/coreslots/${encodeURIComponent(s.slotId)}`}
                      className="text-primary hover:text-primary-light"
                    >
                      {s.slotId}
                    </Link>
                  </Td>
                  <Td>
                    <OperatorLink operatorAddress={s.operatorAddress} />
                  </Td>
                  <Td>
                    <span
                      role="img"
                      aria-label={
                        pct === null
                          ? 'signing data unavailable'
                          : `signed ${pct.toFixed(1)}% of the last 100 blocks`
                      }
                      className="block h-2 w-full min-w-32 max-w-52 overflow-hidden rounded bg-card-border"
                    >
                      <span
                        className={`block h-full rounded ${barColor}`}
                        style={{ width: `${pct ?? 0}%` }}
                      />
                    </span>
                  </Td>
                  <Td mono>{bpsToPercent(h?.uptimeBps)}</Td>
                  <Td mono>{s.consensusPower ?? '—'}</Td>
                </Tr>
              );
            })}
          </Table>
        )
      }
    </QueryBoundary>
  );
}
