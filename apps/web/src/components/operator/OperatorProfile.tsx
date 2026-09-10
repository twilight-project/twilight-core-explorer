import { Server } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DataList } from '@/components/detail/DataList';
import { MetadataFields, hasMetadataFields } from '@/components/detail/MetadataFields';
import type { OperatorMetadata } from '@/lib/operator-metadata';

// Extension-ready operator profile: known fields (today: moniker) get dedicated rows; everything
// else renders as flat key→value lines (MetadataFields) — empty fields are omitted, never shown
// as a raw JSON box. When the chain adds a field, promote it in operator-metadata.ts.
export function OperatorProfile({ metadata }: { metadata: OperatorMetadata }) {
  const hasExtras = hasMetadataFields(metadata.extras);
  if (metadata.moniker === undefined && !hasExtras) return null;

  const items = [
    ...(metadata.moniker !== undefined ? [{ label: 'Moniker', value: metadata.moniker }] : []),
    ...(hasExtras
      ? [{ label: 'Other metadata', value: <MetadataFields value={metadata.extras} /> }]
      : []),
  ];
  return (
    <Card>
      <CardHeader icon={Server} iconTone="coreslot" title="Operator profile" />
      <CardBody>
        <DataList items={items} />
      </CardBody>
    </Card>
  );
}
