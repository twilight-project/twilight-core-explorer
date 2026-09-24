import { MonoCopy } from '@/components/ui/MonoCopy';

// Flat, human rendering for the small JSON objects that used to show as raw JsonView boxes
// (operator metadata, consensus pubkeys). Empty-string/null values are OMITTED — an empty
// field carries no information, so it gets no row. Unknown nested values fall back to a
// compact inline stringify rather than a code box.

function labelize(key: string): string {
  const cleaned = key.replace(/^@/, '').replace(/_/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
}

function ValueText({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) {
      return (
        <a href={value} rel="noreferrer noopener" target="_blank" className="break-all text-primary hover:text-primary-light">
          {value}
        </a>
      );
    }
    return <span className="break-all">{value}</span>;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return <span>{String(value)}</span>;
  return <span className="break-all font-mono text-xs">{JSON.stringify(value)}</span>;
}

/** True when MetadataFields would render at least one row for this value. */
export function hasMetadataFields(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value !== 'object' || Array.isArray(value)) return true;
  return Object.values(value as Record<string, unknown>).some((v) => !isEmpty(v));
}

const DASH = <span className="text-text-muted">—</span>;

/**
 * Key→value rows for a metadata-like object; a muted dash when nothing non-empty exists.
 */
export function MetadataFields({ value }: { value: unknown }) {
  if (!hasMetadataFields(value)) return DASH;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return <ValueText value={value} />;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => !isEmpty(v));
  return (
    <dl className="flex flex-col gap-1 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-text-muted">{labelize(k)}:</dt>
          <dd className="min-w-0 text-text">
            <ValueText value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** `{"@type": ".../ed25519.PubKey", "key": "…"}` → "ed25519 · <key with copy>". */
export function PubkeyInline({ value }: { value: unknown }) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const key = obj['key'];
    const type = obj['@type'];
    if (typeof key === 'string') {
      const algo =
        typeof type === 'string' ? (type.match(/crypto\.([a-z0-9]+)\./i)?.[1] ?? null) : null;
      return (
        <span className="inline-flex items-center gap-2">
          {algo ? <span className="text-xs text-text-muted">{algo}</span> : null}
          <MonoCopy value={key} head={12} tail={8} label="consensus pubkey" />
        </span>
      );
    }
  }
  return <MetadataFields value={value} />;
}
