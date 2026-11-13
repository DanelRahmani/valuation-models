'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { defaultAssumptions } from '@/lib/finance/assumptions';
import { extractHistoricals } from '@/lib/finance/extract';
import { runAll } from '@/lib/finance/run';
import type { CompanyFile, MarketFile } from '@/lib/finance/types';
import { fmt } from '@/lib/format';
import { DiceIcon, loadIndex, pickRandom } from './RandomCompany';
import { prettyName } from '@/lib/names';

interface Example {
  ticker: string;
  name: string;
  fcff: number[];
  pv: number[];
  pvTv: number;
  ev: number;
  perShare: number;
  price: number | null;
  wacc: number;
  baseYear: number;
}

let marketP: Promise<MarketFile | null> | null = null;
const loadMarket = () => (marketP ??= fetch('/data/market.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** Value a company with the same engine as the valuation page; null if its FCFF model is not meaningful. */
async function buildExample(ticker: string): Promise<Example | null> {
  const [market, company] = await Promise.all([
    loadMarket(),
    fetch(`/data/companies/${ticker}.json`).then((r) => (r.ok ? (r.json() as Promise<CompanyFile>) : null)),
  ]);
  if (!company) return null;
  const h = extractHistoricals(company.facts);
  const ind = market?.industries.find((i: { name: string }) => i.name === company.industry);
  const { a, src } = defaultAssumptions(h, {
    price: company.price?.close ?? null,
    rf: market?.rf,
    erp: market?.erp,
    beta: company.beta,
    industryBetaU: ind?.unleveredBeta ?? null,
  });
  const out = runAll(h, a, src);
  const r = out.results.find((x) => x.id === 'fcff');
  const s = out.values.sheets.FCFF;
  if (!r || r.status !== 'ok' || r.perShare == null || r.perShare <= 0) return null;
  const fcff = s.fcff.slice(1).map((v) => v ?? 0);
  if (fcff.some((v) => v <= 0)) return null; // the picture needs positive cash flows
  return {
    ticker,
    name: company.name,
    fcff,
    pv: s.pv.slice(1).map((v) => v ?? 0),
    pvTv: s.pv_tv.at(-1) ?? 0,
    ev: s.ev[0] ?? 0,
    perShare: r.perShare,
    price: out.values.inputs.price,
    wacc: out.values.inputs.wacc ?? 0,
    baseYear: h.years.at(-1) ?? 0,
  };
}

const PREFERRED = ['AAPL', 'MSFT', 'NVDA', 'KO', 'COST', 'V', 'PG', 'JNJ', 'HD', 'MA', 'PEP', 'ADBE'];

export function HeroDcf() {
  const [ex, setEx] = useState<Example | null>(null);
  const [round, setRound] = useState(0);
  const roll = useCallback(async (first = false) => {
    const index = await loadIndex();
    if (!index) return;
    for (let k = 0; k < 8; k++) {
      const t = first && k === 0 ? PREFERRED[Math.floor(Math.random() * PREFERRED.length)] : pickRandom(index).ticker;
      const e = await buildExample(t).catch(() => null);
      if (e) {
        setEx(e);
        setRound((n) => n + 1);
        return;
      }
    }
  }, []);
  useEffect(() => {
    roll(true);
  }, [roll]);

  const W = 790;
  const H = 300;
  const top = 34;
  const base = H - 36;
  const colW = 40;
  const gap = 12;
  const x0 = 8;
  const maxF = ex ? Math.max(...ex.fcff) : 1;
  const y = (v: number) => base - (v / maxF) * (base - top);
  const vx = x0 + 10 * (colW + gap) + 46; // value column
  const vW = 96;
  const sumPv = ex ? ex.pv.reduce((a, b) => a + b, 0) : 0;
  const vScale = ex ? (base - top) / ex.ev : 1;
  const vSumTop = base - sumPv * vScale;
  const vTop = base - (ex?.ev ?? 0) * vScale;
  const thread = ex
    ? ex.pv.map((v, i) => `${i === 0 ? 'M' : 'L'}${x0 + i * (colW + gap) + colW / 2},${y(v)}`).join(' ') +
      ` C ${vx - 30},${y(ex.pv[9])} ${vx - 30},${vTop} ${vx},${vTop}`
    : '';

  return (
    <figure className="relative rounded-[1.5rem] border border-seam bg-panel/70 px-4 pb-5 pt-5 sm:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <figcaption className="font-mono text-xs text-muted">
          {ex ? (
            <span key={round} className="fade-up inline-block">
              Live example · {ex.ticker} · next ten years of free cash flow, discounted at {fmt(ex.wacc, 'pct')}
            </span>
          ) : (
            'Loading a company…'
          )}
        </figcaption>
        <button type="button" onClick={() => roll()} className="link inline-flex items-center gap-1.5 text-sm" aria-label="Show another company">
          <DiceIcon /> Another company
        </button>
      </div>

      <svg key={round} viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={ex ? `${ex.name}: forecast free cash flows, their present values, and the value per share` : 'Loading'}>
        <line x1={0} x2={W} y1={base} y2={base} stroke="var(--seam-color)" strokeDasharray="4 4" />
        {ex &&
          ex.fcff.map((f, i) => {
            const x = x0 + i * (colW + gap);
            return (
              <g key={i}>
                <rect className="dcf-bar fill-panel-strong" x={x} y={y(f)} width={colW} height={base - y(f)} rx={3} style={{ animationDelay: `${i * 60}ms` }} />
                <rect className="dcf-bar fill-accent" x={x + 6} y={y(ex.pv[i])} width={colW - 12} height={base - y(ex.pv[i])} rx={2} style={{ animationDelay: `${900 + i * 60}ms` }} />
                <text x={x + colW / 2} y={H - 16} textAnchor="middle" className="fill-muted font-mono text-[10px]">
                  {`'${String(ex.baseYear + i + 1).slice(2)}`}
                </text>
              </g>
            );
          })}
        {ex && (
          <>
            <mask id={`sew-${round}`}>
              <path
                d={thread}
                fill="none"
                stroke="white"
                strokeWidth={6}
                pathLength={1}
                className="dcf-thread"
                style={{ ['--len' as string]: 1, animationDelay: '1.7s' }}
              />
            </mask>
            <path d={thread} fill="none" className="stroke-accent" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="5 4" mask={`url(#sew-${round})`} />
            <rect className="dcf-bar fill-accent" x={vx} y={vSumTop} width={vW} height={base - vSumTop} rx={3} style={{ animationDelay: '2.6s' }} />
            <rect className="dcf-bar fill-accent/35" x={vx} y={vTop} width={vW} height={vSumTop - vTop} rx={3} style={{ animationDelay: '2.9s' }} />
            <g className="fade-up" style={{ animationDelay: '3.2s' }}>
              <text x={vx + vW / 2} y={H - 16} textAnchor="middle" className="fill-ink font-mono text-[10px]">
                value
              </text>
              <text x={vx + vW + 8} y={(vSumTop + base) / 2} className="fill-muted font-mono text-[10px]">
                10 years
              </text>
              <text x={vx + vW + 8} y={(vTop + vSumTop) / 2 + 4} className="fill-muted font-mono text-[10px]">
                terminal
              </text>
            </g>
          </>
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="flex gap-6 font-mono text-[0.6875rem] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-panel-strong ring-1 ring-[var(--seam)]" /> forecast cash flow
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" /> worth today
          </span>
        </div>
        {ex && (
          <div key={round} className="fade-up text-right" style={{ animationDelay: '3.2s' }}>
            <Link href={`/value/?t=${ex.ticker}`} className="group block">
              <span className="font-serif text-3xl italic">{prettyName(ex.name)}</span>
              <span className="num ml-3 text-3xl text-accent">{fmt(ex.perShare, 'usd')}</span>
              <span className="block font-mono text-[0.6875rem] text-muted">
                per share, FCFF model{ex.price != null ? ` · trades at ${fmt(ex.price, 'usd')}` : ''} · <span className="link">open all eight models</span>
              </span>
            </Link>
          </div>
        )}
      </div>
    </figure>
  );
}
