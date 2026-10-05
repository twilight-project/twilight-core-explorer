'use client';

import Link from 'next/link';
import { SourceChip } from '@/components/provenance/SourceChip';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorState, LoadingState } from '@/components/states/States';
import { Panel } from './Panel';
import { useOperatorAuth, useOperatorProfile } from '@/lib/api/queries';
import { asRecord, feedNumber, feedString } from '@/lib/operator-feed';
import { curatedOperator } from '@/lib/operator-directory';

// Authentication page (phase 15 follow-on): the operator's OAuth authorization server,
// explained for a prospective participant. Everything shown is the operator's own publication
// (RFC 8414 metadata + JWKS), sampled by the explorer and served attested — the chain knows
// nothing about this service, and the page says so. A slot with no service renders truthful
// silence, exactly like the status feed.

// Fixed plain-language captions for the grant types a miner will actually meet. Unknown
// identifiers render as themselves (same rule as the feed vocabulary).
const GRANT_CAPTIONS: Record<string, string> = {
  'urn:ietf:params:oauth:grant-type:device_code':
    'device sign-in — the miner CLI shows a short code you confirm in a browser',
  authorization_code: 'browser sign-in with PKCE — no client secret involved',
  refresh_token: 'silent renewal — the miner keeps its session without re-prompting you',
  'urn:ietf:params:oauth:grant-type:token-exchange': 'token exchange between operator services',
  'urn:ietf:params:oauth:grant-type:jwt-bearer': 'signed-assertion sign-in for automated clients',
};

function EndpointRow({ label, url }: { label: string; url: string | null }) {
  if (url === null) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-card-hover py-2.5 text-[13px]">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
        <span className="break-all text-text-secondary">{url}</span>
        <CopyButton value={url} label={label} />
      </span>
    </div>
  );
}

function ageCaption(ageSeconds: number | null | undefined): string {
  if (ageSeconds == null) return 'never fetched';
  if (ageSeconds < 120) return `sampled ${ageSeconds}s ago`;
  if (ageSeconds < 7200) return `sampled ${Math.round(ageSeconds / 60)} min ago`;
  return `sampled ${Math.round(ageSeconds / 3600)} h ago`;
}

export function OperatorAuth({ slotId }: { slotId: string }) {
  const auth = useOperatorAuth(slotId);
  const profile = useOperatorProfile(slotId);
  const curated = curatedOperator(slotId);

  if (auth.isPending) {
    return (
      <div className="flex flex-col gap-7">
        <BackLink slotId={slotId} />
        <LoadingState rows={6} />
      </div>
    );
  }
  if (auth.isError) {
    return (
      <div className="flex flex-col gap-7">
        <BackLink slotId={slotId} />
        <h1 className="font-serif text-5xl leading-[1.05] tracking-[-0.01em]">Authentication</h1>
        <ErrorState error={auth.error} context="Authentication server" />
      </div>
    );
  }

  const d = auth.data.data;
  const name = curated?.name ?? `CoreSlot ${slotId} operator`;

  if (d.status === 'no_status') {
    return (
      <div className="flex max-w-[720px] flex-col gap-5">
        <BackLink slotId={slotId} />
        <div className="font-mono text-xs uppercase tracking-[.1em] text-text-muted">
          coreslot {slotId} · authentication
        </div>
        <h1 className="font-serif text-5xl leading-[1.05] tracking-[-0.01em]">
          {name} publishes no authentication service.
        </h1>
        <p className="text-[15px] leading-relaxed text-text-muted">
          Participation slots that accept miners run an authorization server next to their
          status feed; this one has none configured in the explorer. That is a state, not an
          error — if the operator starts publishing one, this page fills in.{' '}
          <SourceChip kind="no-status" />
        </p>
      </div>
    );
  }

  const metadata = asRecord(d.metadata.payload);
  const issuer = feedString(metadata['issuer']);
  const grantList = Array.isArray(metadata['grant_types_supported'])
    ? (metadata['grant_types_supported'] as unknown[]).filter(
        (g): g is string => typeof g === 'string',
      )
    : [];
  const dpopAlgs = Array.isArray(metadata['dpop_signing_alg_values_supported'])
    ? (metadata['dpop_signing_alg_values_supported'] as unknown[]).filter(
        (a): a is string => typeof a === 'string',
      )
    : [];
  const pkce = Array.isArray(metadata['code_challenge_methods_supported'])
    ? (metadata['code_challenge_methods_supported'] as unknown[]).filter(
        (m): m is string => typeof m === 'string',
      )
    : [];

  const jwksKeys =
    d.jwks && Array.isArray(asRecord(d.jwks.payload)['keys'])
      ? (asRecord(d.jwks.payload)['keys'] as unknown[]).map(asRecord)
      : [];

  const discovery = asRecord(
    profile.data?.data.discovery?.payload ?? null,
  );
  const participantReads = Array.isArray(discovery['participant_reads'])
    ? (discovery['participant_reads'] as unknown[]).filter(
        (r): r is string => typeof r === 'string',
      )
    : [];
  const publicReads = Array.isArray(discovery['reads'])
    ? (discovery['reads'] as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];
  const rateLimit = asRecord(discovery['rate_limit']);
  const perMinute = feedNumber(rateLimit['per_minute']);

  return (
    <div className="flex flex-col gap-7">
      <BackLink slotId={slotId} />

      <div className="flex flex-col gap-3">
        <div className="font-mono text-xs uppercase tracking-[.1em] text-text-muted">
          coreslot {slotId} · authentication ·{' '}
          <span className={d.reachable ? 'text-primary' : 'text-accent-red'}>
            {d.reachable ? 'reachable' : 'unreachable'}
          </span>{' '}
          · {ageCaption(d.metadata.ageSeconds)}
          {d.stale ? ' · stale' : ''}
        </div>
        <h1 className="font-serif text-5xl leading-[1.05] tracking-[-0.01em]">
          How you sign in to {name}.
        </h1>
        <p className="max-w-[680px] text-[15px] leading-relaxed text-text-muted">
          This operator runs a standard OAuth&nbsp;2.0 authorization server beside its status
          feed. Everything on this page is the server&rsquo;s own published configuration,
          sampled hourly by the explorer <SourceChip kind="attested" /> — the chain has no view
          of it.
        </p>
      </div>

      <div className="grid max-w-[920px] grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="How sign-in works" meta="from the server's RFC 8414 metadata">
          <ul className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-text-secondary">
            {grantList.map((g) => (
              <li key={g} className="flex flex-col gap-0.5">
                <span className="font-mono text-xs text-text">{g}</span>
                <span className="text-text-muted">{GRANT_CAPTIONS[g] ?? 'supported grant'}</span>
              </li>
            ))}
            {dpopAlgs.length > 0 ? (
              <li className="flex flex-col gap-0.5 border-t border-card-hover pt-3">
                <span className="font-mono text-xs text-text">
                  DPoP · {dpopAlgs.join(', ')}
                </span>
                <span className="text-text-muted">
                  tokens are bound to a key on your machine — a stolen token is useless
                  elsewhere
                </span>
              </li>
            ) : null}
            {pkce.length > 0 ? (
              <li className="flex flex-col gap-0.5">
                <span className="font-mono text-xs text-text">PKCE · {pkce.join(', ')}</span>
                <span className="text-text-muted">
                  browser sign-ins are code-challenge protected; there are no client secrets
                </span>
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel title="Endpoints" meta={issuer ?? d.baseUrl}>
          <EndpointRow label="issuer" url={issuer} />
          <EndpointRow label="authorize" url={feedString(metadata['authorization_endpoint'])} />
          <EndpointRow
            label="device authorization"
            url={feedString(metadata['device_authorization_endpoint'])}
          />
          <EndpointRow label="token" url={feedString(metadata['token_endpoint'])} />
          <EndpointRow label="revoke" url={feedString(metadata['revocation_endpoint'])} />
          <EndpointRow label="JWKS" url={feedString(metadata['jwks_uri'])} />
        </Panel>

        <Panel
          title="Signing keys"
          meta={d.jwks ? ageCaption(d.jwks.ageSeconds) : 'not published'}
        >
          {jwksKeys.length === 0 ? (
            <p className="text-[13px] text-text-muted">No keys in the published JWKS.</p>
          ) : (
            <div className="flex flex-col">
              {jwksKeys.map((k, i) => {
                const kid = feedString(k['kid']) ?? `key ${i + 1}`;
                return (
                  <div
                    key={kid}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-card-hover py-2.5"
                  >
                    <span className="flex items-center gap-1.5 font-mono text-xs text-text">
                      {kid}
                      <CopyButton value={kid} label="key id" />
                    </span>
                    <span className="font-mono text-[11.5px] text-text-muted">
                      {[feedString(k['kty']), feedString(k['crv']), feedString(k['alg']), feedString(k['use'])]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                );
              })}
              <p className="pt-3 text-[12.5px] leading-relaxed text-text-muted">
                Receipts and tokens issued by this operator are signed with these keys. A miner
                can verify its own receipts against them — key material comes from the operator,
                not the chain. <SourceChip kind="attested" />
              </p>
            </div>
          )}
        </Panel>

        <Panel title="What needs a sign-in" meta="from the status-feed discovery document">
          {publicReads.length === 0 && participantReads.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              No discovery document sampled yet — see the operator profile.
            </p>
          ) : (
            <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed">
              <p className="text-text-secondary">
                <span className="font-mono text-xs text-text">public · </span>
                {publicReads.join(', ') || 'none'} — readable by anyone, including this
                explorer.
              </p>
              <p className="text-text-secondary">
                <span className="font-mono text-xs text-text">sign-in required · </span>
                {participantReads.join(', ') || 'none'} — your own enrollment and payout detail,
                readable only by you with a DPoP-bound token. The explorer never sees it
                (per-address data stays off this site by design).
              </p>
              {perMinute !== null ? (
                <p className="text-text-muted">
                  Rate limit: {perMinute} requests/min per client.
                </p>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      <p className="max-w-[680px] text-[12.5px] leading-relaxed text-text-muted">
        Base URL <span className="font-mono">{d.baseUrl}</span>{' '}
        <SourceChip kind="configured" title="configured in the explorer, not read from chain" />
        {d.metadata.lastError ? (
          <>
            {' '}
            · last fetch error: <span className="font-mono">{d.metadata.lastError}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function BackLink({ slotId }: { slotId: string }) {
  return (
    <Link
      href={`/operators/${encodeURIComponent(slotId)}`}
      className="font-mono text-xs text-text-muted hover:text-text"
    >
      ← operator profile
    </Link>
  );
}
