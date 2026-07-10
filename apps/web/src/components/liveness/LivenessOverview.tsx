'use client';

import {
  CircleAlert,
  CircleHelp,
  CircleSlash,
  CircleX,
  Database,
  Gauge,
  HeartPulse,
  Server,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/states/States';
import { ApiError, ERROR_CODES } from '@/lib/api/client';
import { useLivenessRisk } from '@/lib/api/queries';
import { statusTone } from '@/lib/format/status';
import { bpsToPercent } from '@/lib/format/bps';
import { formatHeight } from '@/lib/format/height';

// Network halt/liveness-risk summary. A 404 means "no snapshot yet" — a SOFT state, not a hard error.
export function LivenessOverview() {
  const query = useLivenessRisk();

  if (query.isPending) {
    return (
      <Card>
        <CardHeader title="Network liveness risk" />
        <CardBody>
          <LoadingState rows={3} />
        </CardBody>
      </Card>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.code === ERROR_CODES.notFound) {
      return (
        <Card>
          <CardHeader title="Network liveness risk" />
          <CardBody>
            <div className="text-sm text-text-muted">No liveness snapshot yet.</div>
          </CardBody>
        </Card>
      );
    }
    return <ErrorState error={query.error} context="Liveness risk" />;
  }

  const d = query.data.data;
  return (
    <Card>
      <CardHeader title="Network liveness risk" />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(d.haltRiskLevel)}>halt risk: {d.haltRiskLevel}</Badge>
          {d.haltRiskReason ? <span className="text-xs text-text-muted">{d.haltRiskReason}</span> : null}
          <span className="text-xs text-text-muted">policy {d.policyVersion}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={HeartPulse} iconTone="liveness" label="Healthy" value={d.healthySlotCount} mono />
          <StatCard icon={CircleAlert} iconTone="warn" label="Degraded" value={d.degradedSlotCount} mono />
          <StatCard icon={CircleX} iconTone="risk" label="Down" value={d.downSlotCount} mono />
          <StatCard icon={CircleHelp} label="Unknown" value={d.unknownSlotCount} mono />
          <StatCard icon={Server} iconTone="coreslot" label="Active slots" value={d.activeSlotCount} mono />
          <StatCard icon={Gauge} iconTone="liveness" label="Available power" value={bpsToPercent(d.availablePowerBps)} mono />
          <StatCard icon={CircleSlash} iconTone="risk" label="Unavailable power" value={bpsToPercent(d.unavailablePowerBps)} mono />
          <StatCard icon={Database} iconTone="infra" label="Latest committed" value={formatHeight(d.latestCommittedHeight)} mono />
        </div>
      </CardBody>
    </Card>
  );
}
