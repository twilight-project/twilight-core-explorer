'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import type { ECharts } from 'echarts/core';
import { EChart, tooltipBase, useChartTheme, type ChartTheme } from '@/components/charts/EChart';
import { SourceChip } from '@/components/provenance/SourceChip';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  useOperatorHistory,
  useOperatorParticipants,
  useOperatorProfile,
} from '@/lib/api/queries';
import { utwltToTwlt } from '@/components/charts/shape';
import {
  METRICS,
  formatCompact,
  formatDay,
  formatNumber,
  historyCsv,
  lastDays,
  metric,
  payoutSharePct,
  seriesFor,
  totals,
  type HistoryDay,
  type MetricDef,
  type MetricId,
} from '@/lib/operator-dashboard';

// DefiLlama-style operator dashboard: a headline card (total paid + key metrics), one large
// time-series chart with metric switches and a range slider, and a grid of small single-metric
// tiles. Every figure is chain-derived except the enrolled counts, which the operator's auth
// server publishes (attested) — those carry the attested chip wherever they appear.

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('min-w-0 rounded-2xl border border-card-border bg-card', className)}>
      {children}
    </div>
  );
}

function download(filename: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  download(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FileButton({ onClick, children, label }: { onClick: () => void; children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-2.5 py-1.5 font-mono text-xs text-text-secondary hover:border-primary/50 hover:text-text"
    >
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7.5A.5.5 0 0 1 3.5 14V2a.5.5 0 0 1 .5-.5Z" stroke="currentColor" />
        <path d="M8 6.5v5m0 0-2-2m2 2 2-2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </button>
  );
}

function formatValue(m: MetricDef, v: number): string {
  return m.unit === 'TWLT' ? `${formatNumber(v)} TWLT` : `${formatNumber(v)} ${m.unit}`;
}

// ---------- the big chart ----------

function mainOption(t: ChartTheme, days: HistoryDay[], m: MetricDef) {
  const data = seriesFor(days, m.id).map(([, v]) => v);
  const log = m.id === 'latency'; // one settlement stall is 400× the median — log keeps both legible
  const base = {
    animationDuration: 300,
    grid: { left: 8, right: 16, top: 16, bottom: 64, containLabel: true },
    tooltip: {
      ...tooltipBase(t),
      trigger: 'axis',
      axisPointer: m.form === 'bar'
        ? { type: 'shadow', shadowStyle: { color: t.grid } }
        : { type: 'line', lineStyle: { color: t.muted, type: 'dashed' } },
      formatter: (params: Array<{ dataIndex: number; value: number | null }>) => {
        const p = params[0];
        if (!p) return '';
        const d = days[p.dataIndex];
        if (!d) return '';
        const v = p.value === null || p.value === undefined ? '—' : formatValue(m, p.value);
        return (
          `<div style="color:${t.muted};margin-bottom:4px">${formatDay(d.day, true)} · epochs ${d.firstEpoch}–${d.lastEpoch}</div>` +
          `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.primary};margin-right:6px"></span>` +
          `${m.label}&nbsp;&nbsp;<b>${v}</b>`
        );
      },
    },
    xAxis: {
      type: 'category',
      data: days.map((d) => d.day),
      boundaryGap: m.form === 'bar',
      axisLine: { lineStyle: { color: t.border } },
      axisTick: { show: false },
      axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true, formatter: (v: string) => formatDay(v) },
    },
    yAxis: {
      type: log ? 'log' : 'value',
      ...(log ? { logBase: 10, min: 100 } : {}),
      splitNumber: 5,
      splitLine: { lineStyle: { color: t.grid } },
      axisLabel: {
        color: t.muted,
        fontSize: 11,
        formatter: (v: number) => (m.unit === 'TWLT' ? `${formatCompact(v)}` : formatCompact(v)),
      },
    },
    dataZoom: [
      { type: 'inside', throttle: 30 },
      {
        type: 'slider',
        height: 26,
        bottom: 14,
        borderColor: t.border,
        backgroundColor: 'transparent',
        fillerColor: t.primaryFaint.replace(/[\d.]+\)$/, '0.10)'),
        handleStyle: { color: t.primary, borderColor: t.primary },
        moveHandleStyle: { color: t.primary },
        emphasis: { handleStyle: { color: t.primary } },
        dataBackground: { lineStyle: { color: t.muted, opacity: 0.5 }, areaStyle: { color: t.muted, opacity: 0.12 } },
        selectedDataBackground: { lineStyle: { color: t.primary }, areaStyle: { color: t.primary, opacity: 0.2 } },
        textStyle: { color: t.muted, fontSize: 10 },
        labelFormatter: (_: number, v: string) => formatDay(v),
        brushSelect: false,
      },
    ],
  };
  const series =
    m.form === 'bar'
      ? {
          type: 'bar',
          data,
          barMaxWidth: 16,
          barCategoryGap: '20%',
          itemStyle: { color: t.primary, borderRadius: [3, 3, 0, 0] },
          emphasis: { itemStyle: { color: t.primary } },
        }
      : {
          type: 'line',
          data,
          ...(m.cumulative ? { step: 'end' } : {}),
          showSymbol: false,
          symbolSize: 8,
          connectNulls: false,
          lineStyle: { color: t.primary, width: 2 },
          itemStyle: { color: t.primary, borderColor: t.card, borderWidth: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: t.primarySoft },
                { offset: 1, color: t.copperFaint },
              ],
            },
          },
        };
  return { ...base, series: [series] };
}

// ---------- small tiles ----------

function sparkOption(
  t: ChartTheme,
  labels: string[],
  values: Array<number | null>,
  form: 'bar' | 'area',
  fmt: (v: number) => string,
  color?: string,
) {
  const c = color ?? t.primary;
  return {
    animationDuration: 300,
    grid: { left: 0, right: 0, top: 6, bottom: 0 },
    tooltip: {
      ...tooltipBase(t),
      trigger: 'axis',
      axisPointer: form === 'bar' ? { type: 'shadow', shadowStyle: { color: t.grid } } : { type: 'line', lineStyle: { color: t.muted } },
      formatter: (params: Array<{ dataIndex: number; value: number | null }>) => {
        const p = params[0];
        if (!p) return '';
        const v = p.value === null || p.value === undefined ? '—' : fmt(p.value);
        return `<span style="color:${t.muted}">${labels[p.dataIndex] ?? ''}</span>&nbsp;&nbsp;<b>${v}</b>`;
      },
    },
    xAxis: { type: 'category', data: labels, show: false, boundaryGap: form === 'bar' },
    yAxis: { type: 'value', show: false, min: 0 },
    series: [
      form === 'bar'
        ? { type: 'bar', data: values, barCategoryGap: '18%', itemStyle: { color: c, borderRadius: [2, 2, 0, 0] } }
        : {
            type: 'line',
            data: values,
            showSymbol: false,
            smooth: 0.2,
            lineStyle: { color: c, width: 2 },
            areaStyle: { color: c, opacity: 0.12 },
          },
    ],
  };
}

function Tile({
  title,
  value,
  sub,
  chip,
  children,
  tall = false,
}: {
  title: string;
  value: string;
  sub?: string | undefined;
  chip?: ReactNode;
  children: ReactNode;
  tall?: boolean;
}) {
  return (
    <Card className={clsx('flex gap-3 p-4', tall ? 'flex-col' : 'flex-col sm:flex-row sm:items-center')}>
      <div className={clsx('flex min-w-0 flex-col gap-1', !tall && 'sm:w-[44%] sm:shrink-0')}>
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {title}
          {chip}
        </span>
        <span className="whitespace-nowrap font-mono text-[15px] text-text-secondary">
          {value}
          {sub ? <span className="text-text-muted"> {sub}</span> : null}
        </span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </Card>
  );
}

// ---------- the dashboard ----------

export function OperatorDashboard({ slotId }: { slotId: string }) {
  const history = useOperatorHistory(slotId);
  const profile = useOperatorProfile(slotId);
  const participants = useOperatorParticipants(slotId);
  const t = useChartTheme();
  const [metricId, setMetricId] = useState<MetricId>('distinctMiners');
  const [showTable, setShowTable] = useState(false);
  const chartRef = useRef<ECharts | null>(null);

  const days = useMemo(() => history.data?.data.days ?? [], [history.data]);
  const m = metric(metricId);
  const main = useMemo(() => mainOption(t, days, m), [t, days, m]);
  const mainSeries = useMemo(() => seriesFor(days, m.id), [days, m.id]);

  const recent = useMemo(() => lastDays(days, 30), [days]);
  const recentLabels = recent.map((d) => formatDay(d.day, true));
  const minersTile = useMemo(
    () => sparkOption(t, recentLabels, recent.map((d) => d.activeMiners), 'bar', (v) => `${v} miners`),
    // recentLabels is derived from recent
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, recent],
  );
  const paidTile = useMemo(
    () => sparkOption(t, recentLabels, recent.map((d) => utwltToTwlt(d.paid) ?? 0), 'bar', (v) => `${formatNumber(v)} TWLT`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, recent],
  );
  const shareTile = useMemo(
    () => sparkOption(t, recentLabels, recent.map((d) => payoutSharePct(d)), 'bar', (v) => `${v}% to miners`, t.copper),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, recent],
  );
  const paidTotalTile = useMemo(() => {
    let run = 0;
    const values = days.map((d) => {
      run += utwltToTwlt(d.paid) ?? 0;
      return Math.round(run * 100) / 100;
    });
    return sparkOption(t, days.map((d) => formatDay(d.day, true)), values, 'area', (v) => `${formatNumber(v)} TWLT`);
  }, [t, days]);
  const enrolledTile = useMemo(
    () =>
      sparkOption(
        t,
        days.map((d) => formatDay(d.day, true)),
        seriesFor(days, 'enrolled').map(([, v]) => v),
        'area',
        (v) => `${v} per epoch`,
        t.copper,
      ),
    [t, days],
  );
  const top = (participants.data?.data.participants ?? []).slice(0, 14);
  const topTile = useMemo(
    () =>
      sparkOption(
        t,
        top.map((p) => `${p.recipient.slice(0, 12)}…${p.recipient.slice(-4)}`),
        top.map((p) => utwltToTwlt(p.totalReceived) ?? 0),
        'bar',
        (v) => `${formatNumber(v)} TWLT`,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, participants.data],
  );

  if (history.isPending) {
    return (
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Skeleton className="h-[440px] rounded-2xl" />
        <Skeleton className="h-[440px] rounded-2xl" />
      </div>
    );
  }
  if (history.isError || days.length === 0) return null;

  const all = totals(days);
  const today = days[days.length - 1] as HistoryDay;
  const todayPaid = utwltToTwlt(today.paid) ?? 0;
  const last30 = totals(recent);
  const share30 = last30.paid + last30.kept > 0 ? (last30.paid / (last30.paid + last30.kept)) * 100 : null;
  const v = profile.data?.data.verdict ?? null;
  const p = participants.data?.data ?? null;
  const last7Miners = lastDays(days, 7).reduce((a, d) => a + d.activeMiners, 0);
  const latestEnrolled = [...days].reverse().find((d) => d.feed.avgEnrolled !== null);

  const keyMetrics: Array<{ label: string; value: string; hint: string; chip?: ReactNode }> = [
    { label: 'Owed to this slot', value: `${formatNumber(all.entitlement)} TWLT`, hint: 'Reward the chain allotted to slot 3 across every owed epoch.' },
    { label: 'Kept by operator', value: `${formatNumber(all.kept)} TWLT`, hint: 'Released back to the operator when no miner qualified for an epoch.' },
    { label: 'Share to miners (30d)', value: share30 === null ? '—' : `${share30.toFixed(1)}%`, hint: 'Share of the last 30 days of settled rewards that reached miners.' },
    { label: 'Epochs settled', value: `${formatNumber(all.settledEpochs)} / ${formatNumber(all.epochs)}`, hint: 'Owed epochs with a settlement on chain.' },
    { label: 'Miners ever paid', value: p ? `${p.paidAll}` : formatNumber(all.miners), hint: `Distinct addresses paid by this slot.${p ? ` ${p.paid30} in the last 30 days.` : ''}` },
    {
      label: 'Miners enrolled now',
      value: p?.enrolled ? `${p.enrolled.enrolled}` : '—',
      hint: p?.enrolled ? `Epoch ${p.enrolled.epochNumber}, from the auth server's status feed.` : 'The auth server has not published a count.',
      chip: <SourceChip kind="attested" />,
    },
    { label: 'Settlement time', value: v?.medianLatencyBlocks ? `${v.medianLatencyBlocks} blocks` : '—', hint: `Median blocks from epoch close to settlement.${v?.p90LatencyBlocks ? ` p90 ${v.p90LatencyBlocks}.` : ''}` },
  ];

  const lastDay = formatDay(today.day, true);

  return (
    <section aria-label="Operator dashboard" className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Headline + key metrics */}
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-1">
            <span className="w-fit border-b border-dashed border-text-muted/60 text-[15px] text-text-secondary" title="Sum of every payout line this slot's settlements sent to miners.">
              Total paid to miners
            </span>
            <span className="font-mono text-xs text-text-muted">as of {lastDay}</span>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-mono text-[34px] font-medium leading-none tracking-tight">
                {formatNumber(all.paid)}
                <span className="ml-1.5 text-base text-text-muted">TWLT</span>
              </span>
              <span className="font-mono text-sm text-text-muted">
                <span className={todayPaid > 0 ? 'text-accent-green' : 'text-text-secondary'}>
                  +{formatNumber(todayPaid)}
                </span>{' '}
                today
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[15px] font-semibold">Key metrics</span>
              <SourceChip kind="chain" />
            </div>
            {keyMetrics.map((k) => (
              <div key={k.label} className="flex items-baseline justify-between gap-4 border-b border-card-border py-2.5 last:border-b-0">
                <span className="flex items-center gap-2">
                  <span className="border-b border-dashed border-text-muted/60 text-sm text-text-secondary" title={k.hint}>
                    {k.label}
                  </span>
                  {k.chip}
                </span>
                <span className="text-right font-mono text-sm text-text">{k.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto">
            <FileButton label="Download daily history as CSV" onClick={() => downloadCsv(`twilight-slot-${slotId}-history.csv`, historyCsv(days))}>
              .csv
            </FileButton>
          </div>
        </Card>

        {/* Big chart */}
        <Card className="flex flex-col gap-3 p-4">
          <div role="radiogroup" aria-label="Chart metric" className="flex flex-wrap gap-1.5">
            {METRICS.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={x.id === metricId}
                onClick={() => setMetricId(x.id)}
                className={clsx(
                  'whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  x.id === metricId
                    ? 'border-primary/70 bg-primary/10 text-text'
                    : 'border-card-border text-text-muted hover:border-primary/40 hover:text-text',
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-muted">
              <span>{m.caption}{m.id === 'latency' ? ' (log scale)' : ''}.</span>
              <SourceChip kind={m.provenance} />
            </span>
            <span className="flex gap-1.5">
              <FileButton
                label={`Download ${m.label} as CSV`}
                onClick={() =>
                  downloadCsv(
                    `twilight-slot-${slotId}-${m.id}.csv`,
                    ['day,value', ...seriesFor(days, m.id).map(([d, val]) => `${d},${val ?? ''}`)].join('\n') + '\n',
                  )
                }
              >
                .csv
              </FileButton>
              <FileButton
                label={`Download ${m.label} chart as PNG`}
                onClick={() => {
                  const url = chartRef.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: t.card });
                  if (url) download(`twilight-slot-${slotId}-${m.id}.png`, url);
                }}
              >
                .png
              </FileButton>
            </span>
          </div>
          <EChart
            option={main}
            height={360}
            label={`${m.label} per day for slot ${slotId}`}
            onReady={(c) => {
              chartRef.current = c;
            }}
          />
          <button
            type="button"
            onClick={() => setShowTable((s) => !s)}
            aria-expanded={showTable}
            className="w-fit font-mono text-[11px] text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            {showTable ? 'Hide' : 'Show'} as table
          </button>
          {showTable ? (
            <div className="max-h-64 overflow-auto rounded-lg border border-card-border">
              <table className="w-full font-mono text-xs">
                <thead className="sticky top-0 bg-card text-text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-normal">Day</th>
                    <th className="px-3 py-2 text-left font-normal">Epochs</th>
                    <th className="px-3 py-2 text-right font-normal">{m.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...days].reverse().map((d, i) => {
                    const val = mainSeries[days.length - 1 - i]?.[1] ?? null;
                    return (
                      <tr key={d.day} className="border-t border-card-border">
                        <td className="px-3 py-1.5">{formatDay(d.day, true)}</td>
                        <td className="px-3 py-1.5 text-text-muted">{d.firstEpoch}–{d.lastEpoch}</td>
                        <td className="px-3 py-1.5 text-right">{val === null ? '—' : formatValue(m, val)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </div>

      {/* Compact tiles */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Tile title="Miners paid" value={`${last7Miners}`} sub="last 7d">
          <EChart option={minersTile} height={72} label="Miners paid per day, last 30 days" />
        </Tile>
        <Tile title="Paid to miners" value={`${formatNumber(todayPaid)}`} sub="TWLT today">
          <EChart option={paidTile} height={72} label="TWLT paid to miners per day, last 30 days" />
        </Tile>
        <Tile title="Share to miners" value={share30 === null ? '—' : `${share30.toFixed(1)}%`} sub="30d">
          <EChart option={shareTile} height={72} label="Share of settled rewards paid to miners per day, last 30 days" />
        </Tile>
      </div>

      {/* Larger cards */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Tile tall title="Total paid to miners" value={formatNumber(all.paid)} sub="TWLT all time">
          <EChart option={paidTotalTile} height={180} label="TWLT paid to miners, cumulative" />
        </Tile>
        <Tile
          tall
          title="Top miners"
          value={top[0] ? `${formatNumber(utwltToTwlt(top[0].totalReceived) ?? 0)} TWLT` : '—'}
          sub="largest earner"
        >
          {top.length > 0 ? (
            <>
              <EChart option={topTile} height={150} label="TWLT received by the top miners of this slot" />
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-text-muted">
                {top.slice(0, 3).map((x, i) => (
                  <Link key={x.recipient} href={`/accounts/${x.recipient}`} className="hover:text-text">
                    #{i + 1} {x.recipient.slice(0, 10)}…{x.recipient.slice(-4)}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-text-muted">No miner has been paid yet.</p>
          )}
        </Tile>
        <Tile
          tall
          title="Enrolled per epoch"
          value={latestEnrolled?.feed.avgEnrolled != null ? formatNumber(latestEnrolled.feed.avgEnrolled) : '—'}
          sub={latestEnrolled ? `avg, ${formatDay(latestEnrolled.day)}` : undefined}
          chip={<SourceChip kind="attested" />}
        >
          <EChart option={enrolledTile} height={180} label="Average miners enrolled per epoch, per day, as published by the auth server" />
        </Tile>
      </div>
    </section>
  );
}
