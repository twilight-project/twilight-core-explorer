'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Tabs, activeTab, type TabDef } from '@/components/ui/Tabs';
import { CopyButton } from '@/components/ui/CopyButton';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { JsonView } from '@/components/detail/JsonView';
import { RawSection } from '@/components/detail/RawSection';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/States';
import { useTx, useTxRaw, type TxDetailResponse } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { formatAbsoluteTime, formatRelativeTime } from '@/lib/format/time';
import { formatAmount } from '@/lib/format/amount';
import { shortenMiddle } from '@/lib/format/address';
import { summarizeTxDetail, txParties } from '@/lib/format/summary';

type Message = TxDetailResponse['data']['messages'][number];
type TxEvent = TxDetailResponse['data']['events'][number];

const TABS = (msgCount: number, eventCount: number): TabDef[] => [
  { id: 'summary', label: 'Summary' },
  { id: 'messages', label: `Messages (${msgCount})` },
  { id: 'events', label: `Events (${eventCount})` },
  { id: 'raw', label: 'Raw' },
];

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Fee coin as display text; null when there is no fee (zero-fee chain) or the shape is odd. */
function feeDisplay(fee: unknown): string | null {
  const coins = asRecord(fee).amount;
  const first = asRecord(Array.isArray(coins) ? coins[0] : undefined);
  if (typeof first.amount !== 'string' || typeof first.denom !== 'string') return null;
  const a = formatAmount(first.amount, first.denom);
  return `fee ${a.display} ${a.symbol}`;
}

/** One-line "key=value" summary of an event's attributes, addresses shortened. */
function eventSummary(attributes: unknown): string {
  const list = Array.isArray(attributes) ? attributes : [];
  const parts: string[] = [];
  for (const entry of list) {
    const rec = asRecord(entry);
    const key = typeof rec.key === 'string' ? rec.key : undefined;
    let value = typeof rec.value === 'string' ? rec.value : undefined;
    if (!key || value === undefined || key === 'msg_index') continue;
    if (value.startsWith('twilight1') && value.length > 20) value = shortenMiddle(value);
    parts.push(`${key}=${value}`);
  }
  return parts.join(' · ') || '—';
}

function PartyChip({ address, label }: { address: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-2.5 py-1.5 font-mono text-sm text-text">
      <Link
        href={`/accounts/${encodeURIComponent(address)}`}
        className="hover:text-primary"
        title={address}
      >
        {shortenMiddle(address)}
      </Link>
      <CopyButton value={address} label={label} />
    </span>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-card-border py-3 text-sm">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function MessageCard({ m }: { m: Message }) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const decoded = asRecord(m.decodedJson);
  const fields = Object.entries(decoded).filter(([k]) => k !== '@type');
  return (
    <div className="rounded-xl border border-card-border bg-background-secondary">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-card-border px-5 py-4">
        <span className="font-mono text-xs text-text-muted">#{m.msgIndex}</span>
        <span className="text-sm font-medium text-text">
          {m.module ? `${m.module} · ` : ''}
          {m.typeName ?? m.typeUrl}
        </span>
        <span className="hidden font-mono text-xs text-text-muted sm:inline">{m.typeUrl}</span>
        {m.decodeError ? <Badge tone="danger">decode error</Badge> : null}
      </div>
      <div className="px-5 py-3">
        {m.decodeError ? (
          <p className="py-2 text-xs text-accent-red">{m.decodeError}</p>
        ) : (
          <>
            {fields.map(([key, value]) => (
              <div
                key={key}
                className="grid grid-cols-[130px_1fr] gap-4 py-2 text-sm"
              >
                <span className="text-text-muted">{key}</span>
                <span className="break-all font-mono text-text">
                  {typeof value === 'string' ? value : JSON.stringify(value)}
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setJsonOpen((v) => !v)}
              className="mt-2 text-xs text-text-muted hover:text-text"
            >
              {jsonOpen ? 'Hide decoded JSON' : 'Show decoded JSON'}
            </button>
            {jsonOpen ? (
              <div className="mt-2">
                <JsonView value={m.decodedJson} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// Redesign transaction page: verdict first (pill + "Sent 12.5 TWLT" + party chips), then
// tabs — Summary / Messages / Events / Raw. Only the active tab renders, and the raw payload
// is only fetched on the Raw tab (the existing lazy useTxRaw contract).
export function TxDetail({ hash, tab: rawTab }: { hash: string; tab?: string | string[] | undefined }) {
  const query = useTx(hash);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-7">
        <BackLink />
        <LoadingState rows={6} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-col gap-7">
        <BackLink />
        <h1 className="font-serif text-3xl text-text">Transaction</h1>
        <ErrorState error={query.error} context="Transaction" />
      </div>
    );
  }

  const t = query.data.data;
  const tabs = TABS(t.messages.length, t.events.length);
  const tab = activeTab(tabs, rawTab);
  const failed = t.status !== 'success' && t.code !== 0;
  const parties = txParties(t.messages, t.signerAddresses);
  const fee = feeDisplay(t.fee);

  return (
    <div className="flex flex-col gap-7">
      <BackLink />

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {failed ? (
            <Badge tone="danger">✕ Failed{t.code != null ? ` · code ${t.code}` : ''}</Badge>
          ) : (
            <Badge tone="success">✓ Succeeded</Badge>
          )}
          <span className="text-sm text-text-muted">
            {formatRelativeTime(t.time)} · block{' '}
            <Link
              href={`/blocks/${encodeURIComponent(t.height)}`}
              className="font-mono text-primary hover:text-primary-light"
            >
              {formatHeight(t.height)}
            </Link>
          </span>
        </div>
        <h1 className="font-serif text-3xl text-text">
          {summarizeTxDetail(t.messages)}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {parties.from && parties.to ? (
            <>
              <PartyChip address={parties.from} label="sender" />
              <span aria-hidden="true" className="text-text-muted">
                →
              </span>
              <PartyChip address={parties.to} label="recipient" />
            </>
          ) : parties.signer ? (
            <PartyChip address={parties.signer} label="signer" />
          ) : null}
          {fee ? <span className="text-sm text-text-muted">{fee}</span> : null}
        </div>
      </div>

      <Tabs
        tabs={tabs}
        active={tab}
        hrefFor={(id) =>
          id === 'summary'
            ? `/txs/${encodeURIComponent(hash)}`
            : `/txs/${encodeURIComponent(hash)}?tab=${id}`
        }
        ariaLabel="Transaction views"
      />

      {tab === 'summary' ? (
        <div className="grid max-w-4xl grid-cols-1 gap-x-12 md:grid-cols-2">
          <FieldRow label="Hash">
            <MonoCopy value={t.hash} head={14} tail={10} label="tx hash" />
          </FieldRow>
          <FieldRow label="Block · index">
            <span className="font-mono">
              {formatHeight(t.height)} · {t.index}
            </span>
          </FieldRow>
          <FieldRow label="Time">{formatAbsoluteTime(t.time)}</FieldRow>
          <FieldRow label="Gas used / wanted">
            <span className="font-mono">{`${t.gasUsed ?? '—'} / ${t.gasWanted ?? '—'}`}</span>
          </FieldRow>
          <FieldRow label="Result code">
            <span className="font-mono">{t.code ?? '—'}</span>
          </FieldRow>
          <FieldRow label="Memo">{t.memo ? t.memo : '—'}</FieldRow>
        </div>
      ) : null}

      {tab === 'messages' ? (
        t.messages.length === 0 ? (
          <EmptyState message="No messages." />
        ) : (
          <div className="flex max-w-4xl flex-col gap-4">
            {t.messages.map((m) => (
              <MessageCard key={m.msgIndex} m={m} />
            ))}
          </div>
        )
      ) : null}

      {tab === 'events' ? (
        t.events.length === 0 ? (
          <EmptyState message="No events." />
        ) : (
          <ul className="max-w-4xl divide-y divide-card-border overflow-hidden rounded-xl border border-card-border">
            {t.events.map((e: TxEvent, i) => (
              <li
                key={`${e.phase}-${e.type}-${i}`}
                className="grid grid-cols-[160px_1fr] gap-4 bg-background-secondary px-5 py-3 text-sm"
              >
                <span className="font-mono text-primary">{e.type}</span>
                <span className="break-words text-text-secondary">{eventSummary(e.attributes)}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'raw' ? <RawTab hash={hash} /> : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/txs" className="text-sm text-text-muted hover:text-text">
      ← Transactions
    </Link>
  );
}

// Mounted only while the Raw tab is active, so the raw payload is fetched on demand.
function RawTab({ hash }: { hash: string }) {
  const raw = useTxRaw(hash, true);
  return <RawSection expanded onToggle={() => {}} query={raw} />;
}
