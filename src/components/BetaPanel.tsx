'use client';
import { useState } from 'react';
import { parsePriceCsv, regressBeta, type AlignedReturns } from '@/lib/finance/capm';
import type { BetaStats } from '@/lib/finance/types';
import { BetaScatter } from './Charts';

export interface UploadedBeta {
  aligned: AlignedReturns;
  stats: BetaStats;
}

/** Optional: compute a regression beta from two price files the user downloads from Nasdaq.com. */
export function BetaUpload({ ticker, onBeta }: { ticker: string; onBeta: (b: UploadedBeta) => void }) {
  const [stock, setStock] = useState<string | null>(null);
  const [market, setMarket] = useState<string | null>(null);
  const [freq, setFreq] = useState<'monthly' | 'weekly'>('monthly');
  const [err, setErr] = useState<string | null>(null);
  const read = (f: File | undefined, set: (s: string) => void) => f?.text().then(set);
  const run = () => {
    try {
      setErr(null);
      const r = regressBeta(parsePriceCsv(stock!), parsePriceCsv(market!), freq);
      onBeta({ aligned: r.aligned, stats: r.stats });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const t = (ticker || 'nvda').toLowerCase();
  return (
    <div className="mt-4 space-y-3 text-sm">
      <ol className="list-decimal space-y-1 pl-5 text-muted">
        <li>
          On{' '}
          <a className="link" href={`https://www.nasdaq.com/market-activity/stocks/${t}/historical`} target="_blank" rel="noreferrer">
            Nasdaq.com ({t.toUpperCase()})
          </a>{' '}
          choose 5Y, then Download historical data.
        </li>
        <li>
          Do the same for the market on{' '}
          <a className="link" href="https://www.nasdaq.com/market-activity/etf/spy/historical" target="_blank" rel="noreferrer">
            SPY
          </a>
          .
        </li>
        <li>Drop each file in its box. The files never leave your browser.</li>
      </ol>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['Stock prices', stock, setStock],
          ['Market prices (SPY)', market, setMarket],
        ].map(([label, val, set]) => (
          <label key={label as string} className="block cursor-pointer rounded border border-dashed border-seam px-3 py-3 hover:border-accent">
            <span className="block">{label as string}</span>
            <span className="font-mono text-[0.6875rem] text-muted">{val ? 'Loaded' : 'Choose a .csv file'}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => read(e.target.files?.[0], set as (s: string) => void)} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <select value={freq} onChange={(e) => setFreq(e.target.value as 'monthly' | 'weekly')} className="rounded border border-seam bg-transparent px-2 py-1">
          <option value="monthly">Monthly returns, 5 years</option>
          <option value="weekly">Weekly returns, 2 years</option>
        </select>
        <button type="button" disabled={!stock || !market} onClick={run} className="rounded bg-accent px-3 py-1.5 text-bg disabled:opacity-40">
          Estimate beta
        </button>
      </div>
      {err && <p className="text-accent">{err}</p>}
    </div>
  );
}

export function BetaResult({ b }: { b: UploadedBeta }) {
  const s = b.stats;
  const ci = [s.beta - 1.96 * s.se, s.beta + 1.96 * s.se];
  return (
    <div className="mt-4 grid items-center gap-6 sm:grid-cols-2">
      <BetaScatter a={b.aligned} stats={s} />
      <dl className="num grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <dt className="font-sans text-muted">Beta</dt>
        <dd className="text-right">{s.beta.toFixed(2)}</dd>
        <dt className="font-sans text-muted">95% interval</dt>
        <dd className="text-right">
          {ci[0].toFixed(2)} to {ci[1].toFixed(2)}
        </dd>
        <dt className="font-sans text-muted">R²</dt>
        <dd className="text-right">{s.r2.toFixed(2)}</dd>
        <dt className="font-sans text-muted">Blume-adjusted</dt>
        <dd className="text-right">{s.blume.toFixed(2)}</dd>
        <dt className="font-sans text-muted">Periods</dt>
        <dd className="text-right">{s.n}</dd>
      </dl>
    </div>
  );
}
