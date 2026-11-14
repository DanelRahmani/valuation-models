'use client';
/** Does the company earn more than its capital costs, and what does it do with the cash? */
import { useMemo } from 'react';
import { valueCreationSeries, type YearPoint } from '@/lib/finance/metrics';
import type { Historicals } from '@/lib/finance/types';

const W = 640;
const H = 220;
const L = 44;
const B = H - 26;

const pct = (x: number | null | undefined, d = 1) => (x == null ? '–' : `${(x * 100).toFixed(d)}%`);
const times = (x: number | null | undefined) => (x == null ? '–' : `${x.toFixed(1)}×`);

export function ValueCreation({ h, tax, wacc, re, financial, name }: { h: Historicals; tax: number; wacc: number | null; re: number | null; financial: boolean; name: string }) {
  const series = useMemo(() => valueCreationSeries(h, tax, financial).slice(-10), [h, tax, financial]);
  const hurdle = financial ? re : wacc;
  const last = series.at(-1);
  const spread = last?.roic != null && hurdle != null ? last.roic - hurdle : null;
  return (
    <section aria-labelledby="vc-title">
      <h2 id="vc-title" className="font-serif text-3xl">
        Value creation
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        A company creates value only when it earns more on its capital than that capital costs. {name}{' '}
        {spread == null ? (
          'does not report enough to tell for the latest year.'
        ) : (
          <>
            earned <strong className="font-semibold text-ink">{pct(last!.roic)}</strong> on {financial ? 'equity' : 'invested capital'} last year against a{' '}
            {pct(hurdle)} {financial ? 'cost of equity' : 'WACC'}: a spread of{' '}
            <strong className={`font-semibold ${spread >= 0 ? 'text-accent' : 'text-ink'}`}>
              {spread >= 0 ? '+' : ''}
              {(spread * 100).toFixed(1)} points
            </strong>
            .
          </>
        )}
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <figure>
          <figcaption className="mb-2 text-sm">
            {financial ? 'Return on equity' : 'Return on invested capital'} vs {financial ? 'cost of equity' : 'WACC'}
          </figcaption>
          <ReturnChart series={series} hurdle={hurdle} />
          <p className="mt-2 font-mono text-[0.6875rem] text-muted">
            {financial ? 'Net income / book equity.' : 'Operating income after tax / (equity + debt − cash).'} The dashed line is today&apos;s{' '}
            {financial ? 'cost of equity' : 'WACC'}.
          </p>
        </figure>
        <figure>
          <figcaption className="mb-2 text-sm">Where the cash went</figcaption>
          <CashUses series={series} />
        </figure>
      </div>

      <table className="num mt-10 w-full max-w-2xl text-[0.8125rem]">
        <caption className="sr-only">Capital discipline</caption>
        <thead>
          <tr className="border-b border-seam text-left text-muted">
            <th className="py-1.5 font-normal" />
            <th className="w-24 py-1.5 pl-4 text-right font-normal">FY{series[Math.max(0, series.length - 5)]?.year}</th>
            <th className="w-24 py-1.5 pl-4 text-right font-normal">FY{last?.year}</th>
            <th className="hidden py-1.5 pl-6 font-sans font-normal sm:table-cell">What it tells you</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['Stock pay, % of revenue', (p: YearPoint) => pct(p.sbcShare), 'Pay in shares is a real cost that cash flow leaves out.'],
              ...(financial
                ? []
                : ([
                    ['Net debt / EBITDA', (p: YearPoint) => times(p.leverage), 'Years of operating cash to clear the debt. Below 2–3× is comfortable.'],
                    ['Interest coverage', (p: YearPoint) => times(p.coverage), 'Operating income over interest. Below about 3× gets tight.'],
                  ] as const)),
            ] as const
          ).map(([k, f, why]) => (
            <tr key={k} className="border-b border-seam/60">
              <td className="py-1.5 pr-4 font-sans sm:whitespace-nowrap">{k}</td>
              <td className="py-1.5 text-right">{series.length ? f(series[Math.max(0, series.length - 5)]) : '–'}</td>
              <td className="py-1.5 text-right">{last ? f(last) : '–'}</td>
              <td className="hidden py-1.5 pl-6 font-sans text-muted sm:table-cell">{why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ReturnChart({ series, hurdle }: { series: YearPoint[]; hurdle: number | null }) {
  const vals = series.map((p) => p.roic).filter((v): v is number => v != null);
  if (!vals.length) return <p className="text-sm text-muted">Not enough data.</p>;
  const hi = Math.max(0.05, ...vals, hurdle ?? 0) * 1.15;
  const lo = Math.min(0, ...vals);
  const step = (W - L - 10) / series.length;
  const x = (i: number) => L + i * step + step / 2;
  const y = (v: number) => B - ((v - lo) / (hi - lo)) * (B - 14);
  const pts = series.map((p, i) => (p.roic == null ? null : `${x(i)},${y(p.roic)}`)).filter(Boolean);
  const ticks = [lo, (lo + hi) / 2, hi].map((t) => Math.round(t * 100) / 100);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Return on capital by year against the cost of capital">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - 10} y1={y(t)} y2={y(t)} stroke="var(--seam)" />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" className="fill-muted font-mono text-[10px]">
            {(t * 100).toFixed(0)}%
          </text>
        </g>
      ))}
      {hurdle != null && (
        <>
          <line x1={L} x2={W - 10} y1={y(hurdle)} y2={y(hurdle)} stroke="rgb(var(--ink) / 0.55)" strokeDasharray="5 4" />
          <text x={W - 12} y={y(hurdle) - 5} textAnchor="end" className="fill-muted font-mono text-[10px]">
            hurdle {(hurdle * 100).toFixed(1)}%
          </text>
        </>
      )}
      <polyline points={pts.join(' ')} fill="none" stroke="rgb(var(--accent))" strokeWidth={2} className="dcf-thread" style={{ ['--len' as string]: 1600 }} />
      {series.map((p, i) =>
        p.roic == null ? null : (
          <circle key={p.year} cx={x(i)} cy={y(p.roic)} r={3.5} className={hurdle != null && p.roic >= hurdle ? 'fill-accent' : 'fill-bg'} stroke="rgb(var(--accent))" strokeWidth={1.5}>
            <title>{`FY${p.year}: ${(p.roic * 100).toFixed(1)}%`}</title>
          </circle>
        ),
      )}
      {series.map((p, i) => (
        <text key={p.year} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted font-mono text-[10px]">
          {`'${String(p.year).slice(2)}`}
        </text>
      ))}
    </svg>
  );
}

const USES = [
  { k: 'capex', label: 'Capex', fill: 'rgb(var(--accent))' },
  { k: 'acquisitions', label: 'Acquisitions', fill: 'rgb(var(--accent) / 0.45)' },
  { k: 'dividends', label: 'Dividends', fill: 'rgb(var(--ink) / 0.6)' },
  { k: 'buybacks', label: 'Buybacks', fill: 'rgb(var(--ink) / 0.25)' },
] as const;

function CashUses({ series }: { series: YearPoint[] }) {
  const totals = series.map((p) => USES.reduce((s, u) => s + p[u.k], 0));
  const max = Math.max(1, ...totals);
  const step = (W - L - 10) / series.length;
  const bw = Math.min(34, step - 10);
  const y = (v: number) => (v / max) * (B - 14);
  const total10 = USES.map((u) => ({ ...u, sum: series.reduce((s, p) => s + p[u.k], 0) }));
  const all = total10.reduce((s, u) => s + u.sum, 0);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cash spent each year on capex, acquisitions, dividends and buybacks">
        <line x1={L} x2={W - 10} y1={B} y2={B} stroke="var(--seam-color)" strokeDasharray="4 4" />
        <text x={L - 6} y={18} textAnchor="end" className="fill-muted font-mono text-[10px]">
          ${(max / 1e9).toFixed(max >= 1e10 ? 0 : 1)}B
        </text>
        {series.map((p, i) => {
          let acc = 0;
          const x = L + i * step + (step - bw) / 2;
          return (
            <g key={p.year} className="dcf-bar" style={{ animationDelay: `${i * 50}ms` }}>
              {USES.map((u) => {
                const h = y(p[u.k]);
                acc += h;
                return h > 0 ? (
                  <rect key={u.k} x={x} y={B - acc} width={bw} height={h} fill={u.fill}>
                    <title>{`FY${p.year} ${u.label.toLowerCase()} $${(p[u.k] / 1e9).toFixed(1)}B`}</title>
                  </rect>
                ) : null;
              })}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="fill-muted font-mono text-[10px]">
                {`'${String(p.year).slice(2)}`}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.6875rem] text-muted">
        {total10.map((u) => (
          <li key={u.k} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: u.fill }} />
            {u.label} {all ? `${Math.round((u.sum / all) * 100)}%` : ''}
          </li>
        ))}
      </ul>
    </>
  );
}
