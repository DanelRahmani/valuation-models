'use client';
/**
 * Monte Carlo: the headline model re-run thousands of times with every key assumption drawn at random from ranges
 * set by the company's own history. Runs in the browser, in chunks, only when this tab is opened.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workbook } from '@/lib/finance/calcsheet';
import type { Historicals } from '@/lib/finance/types';
import { mcParams, rng, simulate, summarize, type TornadoInputs, type TornadoRow } from '@/lib/finance/uncertainty';
import { fmt } from '@/lib/format';

const DRAWS = 2000;
const CHUNK = 200;
const pct = (x: number | null | undefined, d = 1) => (x == null ? '–' : `${(x * 100).toFixed(d)}%`);

export function Uncertainty({
  wb,
  h,
  inputs,
  financial,
  price,
  base,
  topDriver,
}: {
  wb: Workbook;
  h: Historicals;
  inputs: TornadoInputs;
  financial: boolean;
  price: number | null;
  base: number | null;
  topDriver: TornadoRow | null;
}) {
  const params = useMemo(() => mcParams(h, inputs, financial), [h, inputs, financial]);
  const [seed, setSeed] = useState(1);
  const [values, setValues] = useState<number[]>([]);
  const [invalid, setInvalid] = useState(0);
  const [done, setDone] = useState(0);
  const run = useRef(0);

  // (Re)run whenever the workbook, the ranges or the seed change; chunks keep the page responsive.
  useEffect(() => {
    const id = ++run.current;
    const u = rng(seed);
    let acc: number[] = [];
    let bad = 0;
    let n = 0;
    setValues([]);
    setInvalid(0);
    setDone(0);
    const step = () => {
      if (id !== run.current) return;
      const r = simulate(wb, params, Math.min(CHUNK, DRAWS - n), u, financial);
      acc = acc.concat(r.values);
      bad += r.invalid;
      n += CHUNK;
      setValues(acc);
      setInvalid(bad);
      setDone(Math.min(n, DRAWS));
      if (n < DRAWS) setTimeout(step, 0);
    };
    const t = setTimeout(step, 0);
    return () => clearTimeout(t);
  }, [wb, params, seed, financial]);

  const s = useMemo(() => summarize(values, price), [values, price]);
  const finished = done >= DRAWS;
  const model = financial ? 'residual income' : 'free cash flow to the firm';

  return (
    <section aria-labelledby="mc-title">
      <h2 id="mc-title" className="font-serif text-3xl">
        Uncertainty
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        One number hides how much it depends on. Here the {model} model runs {DRAWS.toLocaleString('en-US')} times, each with growth,{' '}
        {financial ? 'return on equity' : 'margin, capex'}, beta and terminal growth drawn at random from ranges set by the company&apos;s own history.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <figure>
          {s ? <Histogram s={s} price={price} base={base} /> : <div className="h-[220px] animate-pulse rounded-xl bg-panel" aria-hidden />}
          <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-3 font-mono text-[0.6875rem] text-muted">
            <span aria-live="polite">
              {finished ? `${(s?.n ?? 0).toLocaleString('en-US')} scenarios` : `Running… ${done.toLocaleString('en-US')} of ${DRAWS.toLocaleString('en-US')}`}
              {invalid > 0 && ` · ${invalid} skipped (discount rate below growth)`}
            </span>
            <button type="button" onClick={() => setSeed((x) => x + 1)} className="link" disabled={!finished}>
              Run again with new draws
            </button>
          </figcaption>
        </figure>

        <div>
          {s && (
            <ol className="space-y-4">
              {price != null && s.aboveprice != null && (
                <li className="flex gap-4">
                  <span className="num mt-0.5 text-sm text-accent">1</span>
                  <span className="leading-relaxed">
                    In <strong className="font-semibold">{Math.round(s.aboveprice * 100)}%</strong> of scenarios the value is above the {fmt(price, 'usd')} price.
                  </span>
                </li>
              )}
              <li className="flex gap-4">
                <span className="num mt-0.5 text-sm text-accent">2</span>
                <span className="leading-relaxed">
                  The middle 80% of outcomes runs from <strong className="font-semibold">{fmt(s.p10, 'usd')}</strong> to{' '}
                  <strong className="font-semibold">{fmt(s.p90, 'usd')}</strong>, with a median of {fmt(s.p50, 'usd')}.
                </span>
              </li>
              {topDriver && (
                <li className="flex gap-4">
                  <span className="num mt-0.5 text-sm text-accent">3</span>
                  <span className="leading-relaxed">
                    The input that moves the answer most is <strong className="font-semibold">{topDriver.short}</strong>: across its
                    range alone the value swings by {fmt(topDriver.swing, 'usd')} a share.
                  </span>
                </li>
              )}
            </ol>
          )}
          <table className="num mt-8 w-full text-[0.8125rem]">
            <caption className="mb-2 text-left font-sans text-sm text-ink">What is drawn</caption>
            <tbody>
              {[
                [financial ? 'Book growth, years 1–5' : 'Revenue growth, latest year', `${pct(params.g1.mean)} ± ${pct(params.g1.sd)}`, financial ? 'normal, spread of 5-yr average growth' : 'normal, spread of yearly growth; fades as the growth path says'],
                ...(params.margin ? [['Target margin', `${pct(params.margin.mean)} ± ${pct(params.margin.sd)}`, 'normal, spread from 10-yr margins']] : []),
                ...(params.roe ? [['Return on equity', `${pct(params.roe.mean)} ± ${pct(params.roe.sd)}`, 'normal, spread from 10-yr ROE']] : []),
                ['Beta', `${params.beta.mean.toFixed(2)} ± ${params.beta.sd.toFixed(2)}`, inputs.betaSe != null ? 'normal, regression standard error' : 'normal, fixed ±0.15 (no regression used)'],
                ['Terminal growth', `${pct(params.gT.lo)} to ${pct(params.gT.hi)}`, `triangular, peak ${pct(params.gT.mode)}`],
                ...(params.capex ? [['Capex, % of revenue', `${pct(params.capex.mean)} ± ${Math.round(params.capex.spread * 100)}%`, 'uniform']] : []),
              ].map(([k, v, how]) => (
                <tr key={k} className="border-t border-seam/60">
                  <td className="py-1.5 pr-3 font-sans">{k}</td>
                  <td className="py-1.5 pr-3 text-right">{v}</td>
                  <td className="hidden py-1.5 font-sans text-xs text-muted sm:table-cell">{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">Growth and margin are drawn with a 0.3 correlation: strong years tend to bring both.</p>
        </div>
      </div>
    </section>
  );
}

function Histogram({ s, price, base }: { s: NonNullable<ReturnType<typeof summarize>>; price: number | null; base: number | null }) {
  const W = 640;
  const H = 240;
  const B = H - 28;
  const L = 12;
  const lo = s.bins[0].from;
  const hi = s.bins.at(-1)!.to;
  const span = Math.max(hi, price ?? hi) - Math.min(lo, price ?? lo);
  const x0 = Math.min(lo, price ?? lo) - span * 0.02;
  const x1 = Math.max(hi, price ?? hi) + span * 0.02;
  const x = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - 2 * L);
  const max = Math.max(1, ...s.bins.map((b) => b.count));
  const y = (c: number) => (c / max) * (B - 30);
  const mark = (v: number, label: string, dashed = false, row = 0) => (
    <g>
      <line x1={x(v)} x2={x(v)} y1={14 + row * 12} y2={B} className="stroke-ink" strokeDasharray={dashed ? '3 3' : undefined} strokeWidth={dashed ? 1 : 1.2} />
      <text x={x(v) + 4} y={22 + row * 12} className="fill-ink font-mono text-[10px]">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Distribution of value per share: middle 80% from ${fmt(s.p10, 'usd')} to ${fmt(s.p90, 'usd')}`}>
      <rect x={x(s.p10)} y={14} width={Math.max(1, x(s.p90) - x(s.p10))} height={B - 14} className="fill-accent/5" />
      {s.bins.map((b, i) => (
        <rect key={i} x={x(b.from) + 0.5} y={B - y(b.count)} width={Math.max(1, x(b.to) - x(b.from) - 1)} height={y(b.count)} className={price != null && b.from >= price ? 'fill-accent' : 'fill-accent/40'}>
          <title>{`${fmt(b.from, 'usd')}–${fmt(b.to, 'usd')}: ${b.count} scenarios`}</title>
        </rect>
      ))}
      <line x1={L} x2={W - L} y1={B} y2={B} stroke="var(--seam-color)" />
      {mark(s.p50, `median ${fmt(s.p50, 'usd')}`)}
      {price != null && mark(price, `price ${fmt(price, 'usd')}`, true, 1)}
      {base != null && Math.abs(base - s.p50) / Math.max(1, Math.abs(s.p50)) > 0.04 && mark(base, `model ${fmt(base, 'usd')}`, true, 2)}
      {[s.p10, s.p90].map((v, i) => (
        <text key={i} x={x(v)} y={H - 10} textAnchor="middle" className="fill-muted font-mono text-[10px]">
          {i ? 'P90' : 'P10'} {fmt(v, 'usd')}
        </text>
      ))}
    </svg>
  );
}
