'use client';
/** Where the company sits among its S&P 500 peers, from the site's own data. */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { median, peerGroup, peerMultiples, percentile, type CompanyMetrics } from '@/lib/finance/metrics';
import { prettyName } from '@/lib/names';

export interface MetricsFile {
  asOf: string;
  companies: CompanyMetrics[];
}

let metricsP: Promise<MetricsFile | null> | null = null;
export const loadMetrics = () => (metricsP ??= fetch('/data/metrics.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

export function useMetrics() {
  const [m, setM] = useState<MetricsFile | null>(null);
  useEffect(() => {
    let alive = true;
    loadMetrics().then((x) => alive && setM(x));
    return () => {
      alive = false;
    };
  }, []);
  return m;
}

export type PeerMultiples = ReturnType<typeof peerMultiples>;

/** The company's peer group and the median peer multiples, once metrics.json has loaded. */
export function usePeers(ticker: string) {
  const m = useMetrics();
  return useMemo(() => {
    if (!m || !ticker) return null;
    const group = peerGroup(ticker, m.companies);
    if (!group) return null;
    const byTicker = new Map(m.companies.map((c) => [c.ticker, c]));
    return { group, byTicker, multiples: peerMultiples(ticker, group, byTicker), me: byTicker.get(ticker) ?? null };
  }, [m, ticker]);
}

const pct = (x: number | null | undefined) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`);
const times = (x: number | null | undefined) => (x == null ? '–' : `${x.toFixed(1)}×`);

export function Peers({ ticker, onUseMultiples, usingPeers }: { ticker: string; onUseMultiples: (m: PeerMultiples) => void; usingPeers: boolean }) {
  const p = usePeers(ticker);
  if (!p) return <p className="text-sm text-muted">Loading peers…</p>;
  const { group, byTicker, multiples, me } = p;
  const peers = group.members.filter((t) => t !== ticker).map((t) => byTicker.get(t)).filter((c): c is CompanyMetrics => !!c);
  const financial = !!me?.financial;
  const rows: { k: keyof CompanyMetrics; label: string; f: (x: number | null) => string; note: string }[] = [
    ...(financial ? [] : [{ k: 'margin' as const, label: 'Operating margin', f: pct, note: 'higher is better' }]),
    { k: 'growth', label: 'Revenue growth', f: pct, note: 'median of the last 3 years' },
    { k: 'roic', label: financial ? 'Return on equity' : 'Return on capital', f: pct, note: 'higher is better' },
    ...(financial ? [] : [{ k: 'leverage' as const, label: 'Net debt / EBITDA', f: times, note: 'lower is safer' }]),
    ...(financial ? [] : [{ k: 'evEbitda' as const, label: 'EV / EBITDA', f: times, note: 'what the market pays' }]),
    { k: 'pe', label: 'P / E', f: times, note: 'what the market pays' },
    ...(financial ? [{ k: 'pb' as const, label: 'P / B', f: times, note: 'what the market pays' }] : []),
  ];
  return (
    <section aria-labelledby="peers-title">
      <h2 id="peers-title" className="font-serif text-3xl">
        Against its peers
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        {group.basis === 'sub-industry' ? group.name : `${group.name} sector`}: {peers.length} other S&amp;P 500 companies. Each dot is a peer; the ring is{' '}
        {me ? prettyName(me.name) : ticker}.
      </p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[0.8125rem]">
          <thead>
            <tr className="border-b border-seam text-left text-muted">
              <th className="py-1.5 font-normal" />
              <th className="py-1.5 text-right font-normal">{ticker}</th>
              <th className="py-1.5 text-right font-normal">Peer median</th>
              <th className="w-[45%] py-1.5 pl-6 font-normal">Lowest to highest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mine = (me?.[r.k] as number | null) ?? null;
              const vals = peers.map((c) => c[r.k] as number | null).filter((x): x is number => x != null && Number.isFinite(x));
              return (
                <tr key={r.k} className="border-b border-seam/60">
                  <td className="py-2 pr-4">
                    {r.label}
                    <span className="block font-mono text-[0.625rem] text-muted">{r.note}</span>
                  </td>
                  <td className="num py-2 text-right" title={r.k === 'roic' && me?.roicNm ? 'Not meaningful: cash or negative equity leaves almost no invested capital' : undefined}>
                    {r.k === 'roic' && me?.roicNm ? 'n/m' : r.f(mine)}
                  </td>
                  <td className="num py-2 text-right text-muted">
                    {r.f(r.k === 'pe' || r.k === 'evEbitda' || r.k === 'pb' ? multiples[r.k] : median(vals))}
                  </td>
                  <td className="py-2 pl-6">
                    <Strip mine={mine} vals={vals} label={`${r.label}: ${ticker} ranks ${rankText(percentile(mine, vals))}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <button
          type="button"
          onClick={() => onUseMultiples(multiples)}
          disabled={usingPeers || multiples.count < 2}
          className="rounded-full border border-seam px-4 py-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {usingPeers ? 'Multiples model uses these peers' : 'Use these peers in the multiples model'}
        </button>
        <span className="font-mono text-[0.6875rem] text-muted">
          Median P/E {times(multiples.pe)} · EV/EBITDA {times(multiples.evEbitda)} · EV/Sales {times(multiples.evSales)} · P/B {times(multiples.pb)}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted">Peer multiples leave out negative values and outliers (P/E or EV/EBITDA above 100×, P/B or EV/Sales above 50×).</p>
      <p className="mt-4 text-xs text-muted">
        Peers:{' '}
        {peers.map((c, i) => (
          <span key={c.ticker}>
            <Link className="link" href={`/value/?t=${c.ticker}`}>
              {c.ticker}
            </Link>
            {i < peers.length - 1 ? ', ' : ''}
          </span>
        ))}
      </p>
    </section>
  );
}

const rankText = (p: number | null) => (p == null ? 'n/a' : p >= 0.75 ? 'in the top quarter' : p <= 0.25 ? 'in the bottom quarter' : 'in the middle half');

function Strip({ mine, vals, label }: { mine: number | null; vals: number[]; label: string }) {
  if (!vals.length) return <span className="text-muted">–</span>;
  const all = mine != null ? [...vals, mine] : vals;
  // Clip extreme outliers so one company cannot squash the rest.
  const sorted = [...all].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.05)];
  const hi = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const x = (v: number) => (hi === lo ? 50 : 4 + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 92);
  // Positioned in HTML rather than a stretched SVG, so the markers stay round at any width.
  return (
    <div role="img" aria-label={label} className="relative h-4 w-full">
      <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-[var(--seam-color)]" />
      {vals.map((v, i) => (
        <span key={i} aria-hidden className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted/50" style={{ left: `${x(v)}%` }} />
      ))}
      {mine != null && (
        <span aria-hidden className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-bg" style={{ left: `${x(mine)}%` }} />
      )}
    </div>
  );
}
