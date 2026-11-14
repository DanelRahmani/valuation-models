'use client';
/**
 * Two to four companies side by side, valued with the same engine as the company page. "Same growth and risk" gives
 * every company identical growth and beta, so the remaining differences come from margins, reinvestment and debt.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MIN_BETA_R2 } from '@/lib/finance/assumptions';
import { medianGrowth } from '@/lib/finance/metrics';
import { runAll, type RunOutput } from '@/lib/finance/run';
import { fmt } from '@/lib/format';
import { prettyName } from '@/lib/names';
import { valueTicker, type Valued } from '@/lib/valuate';
import { useMetrics } from './Peers';
import { TickerSearch } from './TickerSearch';
import { Label } from './ui';

const MAX = 4;

export const PRESETS: { label: string; tickers: string[] }[] = [
  { label: 'Coca-Cola vs PepsiCo', tickers: ['KO', 'PEP'] },
  { label: 'Nvidia, AMD and Intel', tickers: ['NVDA', 'AMD', 'INTC'] },
  { label: 'Ford, GM and Tesla', tickers: ['F', 'GM', 'TSLA'] },
  { label: 'Defence contractors', tickers: ['LMT', 'NOC', 'GD', 'RTX'] },
  { label: 'Visa vs Mastercard', tickers: ['V', 'MA'] },
  { label: 'Home Depot vs Lowe’s', tickers: ['HD', 'LOW'] },
  { label: 'JPMorgan vs Bank of America', tickers: ['JPM', 'BAC'] },
];

const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(d)}%`);
const times = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '–' : `${x.toFixed(1)}×`);

export default function CompareApp() {
  const params = useSearchParams();
  const router = useRouter();
  const tickers = useMemo(
    () =>
      (params.get('t') ?? '')
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
        .filter((t, i, a) => a.indexOf(t) === i)
        .slice(0, MAX),
    [params],
  );
  const same = params.get('same') === '1';
  const setUrl = (ts: string[], s = same) => router.replace(`/compare/?t=${ts.join(',')}${s ? '&same=1' : ''}`, { scroll: false });

  const [data, setData] = useState<Record<string, Valued | null>>({});
  useEffect(() => {
    let alive = true;
    for (const t of tickers) if (!(t in data)) valueTicker(t).then((v) => alive && setData((d) => ({ ...d, [t]: v })));
    return () => {
      alive = false;
    };
  }, [tickers]); // eslint-disable-line react-hooks/exhaustive-deps

  const loaded = tickers.map((t) => data[t]).filter((v): v is Valued => !!v);
  // Same growth and risk: every company gets the average stage-1 growth and beta of the set.
  const runs = useMemo(() => {
    const res: Record<string, RunOutput> = {};
    if (!same || loaded.length < 2) {
      for (const v of loaded) res[v.company.ticker] = v.out;
      return res;
    }
    const g1 = loaded.reduce((s, v) => s + v.a.g1, 0) / loaded.length;
    const beta = loaded.reduce((s, v) => s + v.a.beta, 0) / loaded.length;
    for (const v of loaded) res[v.company.ticker] = runAll(v.h, { ...v.a, g1, beta }, v.src);
    return res;
  }, [same, loaded.map((v) => v.company.ticker).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pt-12">
      <Label>Compare</Label>
      <h1 className="mt-4 font-serif text-5xl italic leading-[1.02] sm:text-6xl">Side by side</h1>
      <div aria-hidden className="mt-5 h-px w-40 bg-accent/70" />
      <p className="mt-6 max-w-2xl text-muted">
        Up to four S&amp;P 500 companies through the same models, with the same data and the same rules. Pick a classic pairing or add your own.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const on = p.tickers.join() === tickers.join();
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => setUrl(p.tickers)}
              aria-pressed={on}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${on ? 'border-accent bg-accent text-bg' : 'border-seam hover:border-accent hover:text-accent'}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-start gap-4">
        <div className="w-full max-w-xs">
          {tickers.length < MAX ? (
            <TickerSearch compact exclude={tickers} placeholder={tickers.length ? 'Add a company…' : 'Pick a company…'} onPick={(t) => setUrl([...tickers, t])} />
          ) : (
            <p className="py-2 text-sm text-muted">Four is the maximum; remove one to add another.</p>
          )}
        </div>
        {tickers.length > 1 && (
          <label className="flex items-center gap-2 py-2 text-sm">
            <input type="checkbox" checked={same} onChange={(e) => setUrl(tickers, e.target.checked)} className="accent-[rgb(var(--accent))]" />
            Same growth and risk for all
          </label>
        )}
      </div>
      {same && tickers.length > 1 && (
        <p className="mt-2 max-w-2xl text-xs text-muted">
          Every company gets the average growth and beta of the set, so the gaps that remain come from margins, reinvestment and balance sheets.
        </p>
      )}

      {tickers.length === 0 ? (
        <p className="mt-16 text-muted">Choose a pairing above to start.</p>
      ) : (
        <CompareTable tickers={tickers} data={data} runs={runs} onRemove={(t) => setUrl(tickers.filter((x) => x !== t))} />
      )}

    </div>
  );
}

type Row = { label: string; note?: string; cell: (v: Valued, out: RunOutput) => React.ReactNode; best?: (v: Valued, out: RunOutput) => number | null; section?: string };

function CompareTable({ tickers, data, runs, onRemove }: { tickers: string[]; data: Record<string, Valued | null>; runs: Record<string, RunOutput>; onRemove: (t: string) => void }) {
  const metrics = useMetrics();
  const m = (t: string) => metrics?.companies.find((c) => c.ticker === t) ?? null;
  const model = (out: RunOutput, id: string) => out.results.find((r) => r.id === id);
  const vsPrice = (v: number | null | undefined, price: number | null | undefined) => {
    if (v == null || price == null) return null;
    const d = v / price - 1;
    return <span className="block font-mono text-[0.625rem] text-muted">{`${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}% vs price`}</span>;
  };
  const modelCell = (id: string) => (v: Valued, out: RunOutput) => {
    const r = model(out, id);
    if (!r || r.status !== 'ok' || r.perShare == null) return <span className="text-muted">n/a</span>;
    return (
      <>
        {fmt(r.perShare, 'usd')}
        {vsPrice(r.perShare, out.values.inputs.price)}
      </>
    );
  };
  const rows: Row[] = [
    { section: 'Price and value', label: 'Share price', cell: (_, out) => fmt(out.values.inputs.price ?? null, 'usd') },
    { label: 'Free cash flow to the firm', cell: modelCell('fcff') },
    { label: 'Free cash flow to equity', cell: modelCell('fcfe') },
    { label: 'Residual income', cell: modelCell('ri') },
    { label: 'Multiples', cell: modelCell('multiples') },
    { label: 'Growth the price implies', note: 'reverse DCF, years 1–5', cell: (_, out) => pct(out.reverse.growth) },
    {
      section: 'Risk',
      label: 'Regression beta',
      cell: (v) =>
        v.company.beta ? (
          <>
            {v.company.beta.beta.toFixed(2)}
            <span className="block font-mono text-[0.625rem] text-muted">
              R² {v.company.beta.r2.toFixed(2)}
              {v.company.beta.r2 < MIN_BETA_R2 ? ', weak' : ''}
            </span>
          </>
        ) : (
          '–'
        ),
    },
    { label: 'Blume-adjusted beta', cell: (v) => (v.company.beta ? v.company.beta.blume.toFixed(2) : '–') },
    { label: 'Industry beta', note: 'relevered', cell: (v) => (v.relevered != null ? v.relevered.toFixed(2) : '–') },
    { label: 'WACC', cell: (_, out) => pct(out.values.inputs.wacc) },
    { section: 'Business', label: 'Operating margin', cell: (v) => pct(m(v.company.ticker)?.margin), best: (v) => m(v.company.ticker)?.margin ?? null },
    { label: 'Revenue growth', note: 'median, last 3 years', cell: (v) => pct(medianGrowth(v.h)), best: (v) => medianGrowth(v.h) },
    {
      label: 'Return on capital',
      note: 'vs WACC',
      cell: (v, out) => {
        if (m(v.company.ticker)?.roicNm)
          return (
            <span title="Cash or negative equity leaves almost no invested capital, so the ratio would be meaningless">
              n/m<span className="block font-mono text-[0.625rem] text-muted">too little capital</span>
            </span>
          );
        const r = m(v.company.ticker)?.roic;
        const w = v.financial ? out.values.inputs.re : out.values.inputs.wacc;
        return (
          <>
            {pct(r)}
            {r != null && w != null && <span className="block font-mono text-[0.625rem] text-muted">{`${r >= w ? '+' : ''}${((r - w) * 100).toFixed(1)} pts`}</span>}
          </>
        );
      },
      best: (v) => m(v.company.ticker)?.roic ?? null,
    },
    { label: 'Net debt / EBITDA', cell: (v) => times(m(v.company.ticker)?.leverage) },
    { label: 'EV / EBITDA', cell: (v) => times(m(v.company.ticker)?.evEbitda) },
    { label: 'P / E', cell: (v) => times(m(v.company.ticker)?.pe) },
  ];

  const cols = tickers.map((t) => ({ t, v: data[t], out: runs[t] }));
  return (
    <div className="mt-10 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-seam">
            <th className="w-56 py-3" />
            {cols.map(({ t, v }) => (
              <th key={t} className="px-3 py-3 text-right align-bottom font-normal">
                <div className="flex items-start justify-end gap-2">
                  <div>
                    <Link href={`/value/?t=${t}`} className="link num text-base">
                      {t}
                    </Link>
                    <span className="block max-w-[11rem] truncate text-xs text-muted">{v ? prettyName(v.h.name) : v === null ? 'not in the data' : 'loading…'}</span>
                  </div>
                  <button type="button" onClick={() => onRemove(t)} aria-label={`Remove ${t}`} className="mt-0.5 text-muted transition-colors hover:text-accent">
                    ×
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const scores = cols.map(({ v, out }) => (v && out && r.best ? r.best(v, out) : null));
            const top = scores.some((x) => x != null) ? Math.max(...scores.filter((x): x is number => x != null)) : null;
            return (
              <tr key={r.label} className={r.section ? 'border-t-2 border-seam' : 'border-t border-seam/60'}>
                <td className="py-2.5 pr-4 align-top">
                  {r.section && <span className="mb-1 block font-mono text-[0.625rem] uppercase tracking-wider text-muted">{r.section}</span>}
                  {r.label}
                  {r.note && <span className="block font-mono text-[0.625rem] text-muted">{r.note}</span>}
                </td>
                {cols.map(({ t, v, out }, i) => (
                  <td key={t} className={`num px-3 py-2.5 text-right align-top ${top != null && scores[i] === top && cols.length > 1 ? 'text-accent' : ''}`}>
                    {v && out ? r.cell(v, out) : <span className="text-muted">…</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 font-mono text-[0.6875rem] text-muted">Highlighted: highest of the set on margin, growth and return on capital. Each company uses its own default assumptions unless &ldquo;same growth and risk&rdquo; is on.</p>
    </div>
  );
}
