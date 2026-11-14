'use client';
/**
 * "Walk me through it": the FCFF valuation told in eight animated steps, from ten years of history to the price the
 * market implies. Everything is drawn from the same model run the page shows, so the numbers always agree.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { MODEL_NOTES } from '@/content/modelNotes';
import type { ModelId } from '@/lib/finance/calcsheet';
import { medianGrowth } from '@/lib/finance/metrics';
import type { RunOutput } from '@/lib/finance/run';
import type { Historicals } from '@/lib/finance/types';
import { fmt } from '@/lib/format';

const STEP_MS = 7000;
const H = 420;

/** Canvas width and type size: a narrower canvas with larger type on phones, so labels stay legible. */
const Dims = createContext({ W: 960, compact: false });
const useDims = () => useContext(Dims);
const BASE = 360;
const TOP = 36;

const money = (m: number | null | undefined) => {
  if (m == null || !Number.isFinite(m)) return '–';
  const s = m < 0 ? '−' : '';
  const v = Math.abs(m);
  return v >= 1000 ? `${s}$${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: v >= 100_000 ? 0 : 1 })}B` : `${s}$${v.toFixed(0)}M`;
};
const pct = (x: number | null | undefined, d = 1) => (x == null ? '–' : `${(x * 100).toFixed(d)}%`);

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return r;
}

/** Counts from 0 to `to` with an ease-out curve; jumps straight there under reduced motion. */
function CountUp({ to, format, ms = 1400, reduced }: { to: number; format: (x: number) => string; ms?: number; reduced: boolean }) {
  const [v, setV] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) return setV(to);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(to * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, reduced]);
  return <>{format(v)}</>;
}

interface Story {
  name: string;
  years: number[];
  revenue: (number | null)[];
  margin: (number | null)[];
  baseYear: number;
  f: Record<string, (number | null)[]>;
  wacc: number;
  g1: number;
  gT: number;
  tax: number;
  debt: number;
  cashLike: number;
  shares: number;
  perShare: number;
  price: number | null;
  reverse: number | null;
  marginTarget: number | null;
  /** Every model that produced a value, FCFF (the one this walkthrough follows) first. */
  models: { id: ModelId; label: string; short: string; v: number }[];
  /** Median revenue growth over the last three years. */
  pastGrowth: number | null;
}

/** The models compared on the value-per-share step, in the order the page lists them. */
const COMPARED: ModelId[] = ['fcff', 'fcfe', 'apv', 'ri', 'total_payout', 'multiples', 'ddm_2stage'];
const SHORT: Partial<Record<ModelId, string>> = { fcff: 'FCFF', fcfe: 'FCFE', apv: 'APV', ri: 'Resid. income', total_payout: 'Total payout', multiples: 'Multiples', ddm_2stage: 'Dividends' };

/** About `n` round gridline values inside [lo, hi]: steps of 1, 2, 2.5 or 5 times a power of ten. */
function niceTicks(lo: number, hi: number, n = 3): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

export function buildStory(name: string, h: Historicals, out: RunOutput): Story | null {
  const fcff = out.results.find((r) => r.id === 'fcff');
  const f = out.values.sheets.FCFF;
  const I = out.values.inputs;
  if (!fcff || fcff.status !== 'ok' || fcff.perShare == null || !f || I.shares == null || I.wacc == null) return null;
  const n = Math.min(10, h.years.length);
  const years = h.years.slice(-n);
  const rev = (h.items.revenue ?? []).slice(-n).map((v) => (v ? v.value / 1e6 : null));
  const ebit = (h.items.operatingIncome ?? []).slice(-n).map((v) => (v ? v.value / 1e6 : null));
  return {
    name,
    years,
    revenue: rev,
    margin: rev.map((r, i) => (r && ebit[i] != null ? ebit[i]! / r : null)),
    baseYear: h.years.at(-1)!,
    f,
    wacc: I.wacc,
    g1: I.g_stage1 ?? 0,
    gT: I.g_terminal ?? 0,
    tax: I.tax ?? 0,
    debt: I.debt ?? 0,
    cashLike: (I.cash ?? 0) + (I.sti ?? 0),
    shares: I.shares,
    perShare: fcff.perShare,
    price: I.price ?? null,
    reverse: out.reverse.growth,
    marginTarget: I.margin_target ?? null,
    models: COMPARED.flatMap((id) => {
      const r = out.results.find((x) => x.id === id);
      return r && r.status === 'ok' && r.perShare != null && Number.isFinite(r.perShare) && r.perShare > 0
        ? [{ id, label: MODEL_NOTES[id]?.short ?? id, short: SHORT[id] ?? id, v: r.perShare }]
        : [];
    }),
    pastGrowth: medianGrowth(h),
  };
}

const STEPS = ['Ten years of history', 'From profit to free cash flow', 'The forecast', 'Discounting to today', 'The terminal value', 'From the firm to its shares', 'Value per share', 'What the price implies'];

export function StoryMode({ story, open, onClose }: { story: Story; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const reduced = useReducedMotion();
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 640px)');
    setCompact(m.matches);
    const on = () => setCompact(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  const W = compact ? 560 : 960;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setStep(0);
      setPlaying(true);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const go = useCallback((s: number) => setStep(Math.max(0, Math.min(STEPS.length - 1, s))), []);

  useEffect(() => {
    if (!open || !playing) return;
    if (step >= STEPS.length - 1) return setPlaying(false);
    const id = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [open, playing, step]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') (go(step + 1), setPlaying(false));
    if (e.key === 'ArrowLeft') (go(step - 1), setPlaying(false));
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onKeyDown={onKey}
      aria-labelledby="story-title"
      className="story fixed inset-0 m-0 h-full max-h-full w-full max-w-full overflow-y-auto bg-bg p-0 text-ink"
    >
      <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-4 sm:px-8 sm:py-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[0.75rem] text-muted">
              {story.name} · step {step + 1} of {STEPS.length}
            </p>
            <h2 id="story-title" className="mt-1 font-serif text-3xl leading-tight sm:text-4xl">
              {STEPS[step]}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full border border-seam px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent">
            Close <span aria-hidden>×</span>
          </button>
        </header>

        <div className="relative mt-4 min-h-0 flex-1">
          <Dims.Provider value={{ W, compact }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={STEPS[step]} preserveAspectRatio="xMidYMid meet">
            <line x1={40} x2={W - 20} y1={BASE} y2={BASE} stroke="var(--seam-color)" strokeDasharray="4 4" />
            {step === 0 && <History s={story} />}
            {step === 1 && <Waterfall s={story} />}
            {step >= 2 && step <= 4 && <Forecast s={story} phase={step - 2} />}
            {step === 5 && <Bridge s={story} />}
            {step === 6 && <PerShare s={story} reduced={reduced} />}
            {step === 7 && <Implied s={story} />}
          </svg>
          </Dims.Provider>
        </div>

        <p key={step} className="fade-up mx-auto mt-3 max-w-3xl text-center font-serif text-lg leading-snug sm:text-xl">
          <Caption s={story} step={step} reduced={reduced} />
        </p>

        <nav aria-label="Walkthrough steps" className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => (go(step - 1), setPlaying(false))} disabled={step === 0} className="rounded-full border border-seam px-4 py-2 text-sm transition-colors hover:border-accent disabled:opacity-40">
            Back
          </button>
          <ol className="flex items-center gap-1.5">
            {STEPS.map((t, i) => (
              <li key={t}>
                <button
                  type="button"
                  aria-label={`Step ${i + 1}: ${t}`}
                  aria-current={i === step ? 'step' : undefined}
                  onClick={() => (go(i), setPlaying(false))}
                  className="grid h-6 w-6 place-items-center"
                >
                  <span className={`block h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-5 bg-accent' : i < step ? 'w-1.5 bg-accent/50' : 'w-1.5 bg-muted/40'}`} />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setPlaying((p) => !p)} disabled={step === STEPS.length - 1} className="rounded-full border border-seam px-4 py-2 text-sm transition-colors hover:border-accent disabled:opacity-40">
            {playing ? 'Pause' : 'Play'}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => (go(step + 1), setPlaying(false))} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover">
              Next
            </button>
          ) : (
            <button type="button" onClick={onClose} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover">
              Explore the model
            </button>
          )}
        </nav>
        {playing && step < STEPS.length - 1 && (
          <div aria-hidden className="mx-auto mt-3 h-px w-40 overflow-hidden bg-seam">
            <div key={step} className="story-progress h-full bg-accent" style={{ animationDuration: `${STEP_MS}ms` }} />
          </div>
        )}
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ Scenes ------------------------------------------------------------------ */

const useText = () => {
  const { compact } = useDims();
  return { label: `fill-muted font-mono ${compact ? 'text-[15px]' : 'text-[11px]'}`, value: `fill-ink font-mono ${compact ? 'text-[16px]' : 'text-[12px]'}`, big: compact ? 'text-[28px]' : 'text-[22px]' };
};

function History({ s }: { s: Story }) {
  const { W, compact } = useDims();
  const { label, value, big } = useText();
  void compact;
  void big;
  const n = s.years.length;
  const left = compact ? 84 : 76;
  const step = (W - left - 30) / n;
  const bw = Math.min(56, step - 14);
  // Revenue bars in the lower band, the margin line in its own band above them so the two never collide. Each band has
  // its own faint scale on the left, so the line and the bars can be read, not just admired.
  const max = Math.max(1, ...s.revenue.map((v) => v ?? 0));
  const rTicks = niceTicks(0, max, 3);
  const y = (v: number) => BASE - (Math.max(0, v) / max) * (BASE - TOP - 120);
  const mVals = s.margin.filter((m): m is number => m != null);
  const mLo = Math.min(0, ...mVals);
  const mHi = Math.max(0.05, ...mVals);
  const mTicks = niceTicks(mLo, mHi, 3);
  const my = (m: number) => TOP + 14 + (1 - (m - mLo) / (mHi - mLo || 1)) * 64;
  const cx = (i: number) => left + i * step + step / 2;
  const pts = s.margin.map((m, i) => (m == null ? null : [cx(i), my(m)] as const)).filter(Boolean) as (readonly [number, number])[];
  // Trend: the constant growth rate that links the first year to the last, drawn as a curve over the bars.
  const i0 = s.revenue.findIndex((v) => v != null && v > 0);
  const r0 = i0 >= 0 ? s.revenue[i0]! : null;
  const rN = s.revenue.at(-1);
  const cagr = r0 && rN && rN > 0 && n - 1 > i0 ? Math.pow(rN / r0, 1 / (n - 1 - i0)) - 1 : null;
  const trend =
    cagr != null && r0 ? Array.from({ length: n - i0 }, (_, k) => [cx(i0 + k), y(r0 * Math.pow(1 + cagr, k))] as const) : [];
  const grid = (yy: number, text: string, k: number) => (
    <g key={text + yy} className="fade-up" style={{ animationDelay: `${k * 60}ms` }}>
      <line x1={left} x2={W - 20} y1={yy} y2={yy} stroke="var(--seam-color)" strokeOpacity={0.45} strokeDasharray="2 4" />
      <text x={left - 8} y={yy + 4} textAnchor="end" className={label}>
        {text}
      </text>
    </g>
  );
  return (
    <g>
      {rTicks.filter((t) => t > 0).map((t, k) => grid(y(t), money(t), k))}
      {pts.length > 1 && mTicks.map((t, k) => grid(my(t), pct(t, 0), k + 2))}
      {s.years.map((yr, i) => {
        const x = left + i * step + (step - bw) / 2;
        const r = s.revenue[i] ?? 0;
        return (
          <g key={yr}>
            <rect className="dcf-bar fill-panel-strong" stroke="var(--seam-color)" x={x} y={y(r)} width={bw} height={BASE - y(r)} rx={3} style={{ animationDelay: `${i * 70}ms` }} />
            {(!compact || i % 2 === n % 2 || i === n - 1) && (
              <text x={x + bw / 2} y={BASE + 20} textAnchor="middle" className={label}>
                {`'${String(yr).slice(2)}`}
              </text>
            )}
            {(i === 0 || i === n - 1) && (
              <text x={x + bw / 2} y={y(r) - 8} textAnchor="middle" className={`${value} fade-up`} style={{ animationDelay: `${600 + i * 70}ms` }}>
                {money(r)}
              </text>
            )}
          </g>
        );
      })}
      {trend.length > 1 && (
        <>
          <polyline
            className="dcf-thread"
            points={trend.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="rgb(var(--ink))"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            style={{ ['--len' as string]: 2000, animationDelay: '1700ms' }}
          />
          <text
            x={trend.at(-1)![0] - bw / 2 - 6}
            y={trend.at(-1)![1] + (compact ? 34 : 28)}
            textAnchor="end"
            className={`${label} fade-up`}
            style={{ animationDelay: '2600ms' }}
          >
            trend {cagr! >= 0 ? '+' : ''}
            {pct(cagr, 0)} a year
          </text>
        </>
      )}
      {pts.length > 1 && (
        <>
          <polyline
            className="dcf-thread"
            points={pts.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth={2}
            style={{ ['--len' as string]: 2000, animationDelay: '700ms' }}
          />
          {pts.map(([x, yy], i) => (
            <circle key={i} cx={x} cy={yy} r={3.5} className="fill-accent fade-up" style={{ animationDelay: `${900 + i * 60}ms` }} />
          ))}
          <text x={pts.at(-1)![0]} y={pts.at(-1)![1] - 12} textAnchor="end" className="fill-accent font-mono text-[12px] fade-up" style={{ animationDelay: '1500ms' }}>
            operating margin {pct(s.margin.at(-1))}
          </text>
          <text x={left} y={TOP - 2} className={label}>
            operating margin
          </text>
          <text x={left} y={TOP + 104} className={label}>
            revenue
          </text>
        </>
      )}
    </g>
  );
}

function Waterfall({ s }: { s: Story }) {
  const { W, compact } = useDims();
  const { label, value, big } = useText();
  void compact;
  void big;
  const f = s.f;
  const ebit = f.ebit?.[1] ?? 0;
  const nopat = f.nopat?.[1] ?? 0;
  const da = f.da?.[1] ?? 0;
  const capex = f.capex?.[1] ?? 0;
  const dnwc = f.dnwc?.[1] ?? 0;
  const fcff = f.fcff?.[1] ?? 0;
  const items: { k: string; from: number; to: number; total?: boolean }[] = [
    { k: compact ? 'EBIT' : 'Operating income', from: 0, to: ebit, total: true },
    { k: '− Tax', from: ebit, to: nopat },
    { k: '+ D&A', from: nopat, to: nopat + da },
    { k: '− Capex', from: nopat + da, to: nopat + da - capex },
    { k: compact ? '− WC' : '− Working capital', from: nopat + da - capex, to: fcff },
    { k: compact ? 'FCF' : 'Free cash flow', from: 0, to: fcff, total: true },
  ];
  const hi = Math.max(1, ...items.flatMap((i) => [i.from, i.to]));
  const lo = Math.min(0, ...items.flatMap((i) => [i.from, i.to]));
  const y = (v: number) => BASE - ((v - lo) / (hi - lo)) * (BASE - TOP - 30);
  const step = (W - 140) / items.length;
  const bw = Math.min(90, step - 24);
  return (
    <g>
      {items.map((it, i) => {
        const x = 80 + i * step + (step - bw) / 2;
        const top = y(Math.max(it.from, it.to));
        const h = Math.max(2, Math.abs(y(it.from) - y(it.to)));
        const down = it.to < it.from;
        return (
          <g key={it.k} className="fade-up" style={{ animationDelay: `${i * 380}ms` }}>
            <rect x={x} y={top} width={bw} height={h} rx={3} className={it.total ? 'fill-accent' : down ? 'fill-panel-strong' : 'fill-accent/40'} stroke={it.total ? 'none' : 'var(--seam-color)'} />
            {i < items.length - 1 && <line x1={x + bw} x2={x + step} y1={y(it.to)} y2={y(it.to)} stroke="var(--seam-color)" strokeDasharray="3 3" />}
            <text x={x + bw / 2} y={top - 8} textAnchor="middle" className={value}>
              {money(it.total ? it.to : it.to - it.from)}
            </text>
            <text x={x + bw / 2} y={BASE + 20} textAnchor="middle" className={label}>
              {it.k}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Phase 0: forecast bars rise. Phase 1: each shrinks to its present value. Phase 2: the terminal value arrives. */
function Forecast({ s, phase }: { s: Story; phase: number }) {
  const { W, compact } = useDims();
  const { label, value, big } = useText();
  void compact;
  void big;
  const n = 10;
  const fc = Array.from({ length: n }, (_, i) => s.f.fcff?.[i + 1] ?? 0);
  const df = Array.from({ length: n }, (_, i) => s.f.df?.[i + 1] ?? 1);
  const pvTv = s.f.pv_tv?.[n] ?? 0;
  const ev = s.f.ev?.[0] ?? 0;
  const sumPv = ev - pvTv;
  const showTv = phase === 2;
  const max = Math.max(1, ...fc.map((v) => Math.abs(v)));
  // Room for the terminal-value columns is kept from the start, so the bars never jump sideways between steps.
  const chartW = W - (compact ? 250 : 330);
  const step = chartW / n;
  const bw = Math.min(48, step - 12);
  const scale = (BASE - TOP - 40) / max;
  const tvScale = (BASE - TOP - 40) / Math.max(pvTv, sumPv, 1);
  return (
    <g>
      {fc.map((v, i) => {
        const x = 70 + i * step + (step - bw) / 2;
        const h = Math.abs(v) * scale;
        const k = phase >= 1 ? df[i] : 1;
        return (
          <g key={i} style={{ transition: 'transform 900ms cubic-bezier(0.22,1,0.36,1)' }}>
            {phase >= 1 && <rect x={x} y={BASE - h} width={bw} height={h} rx={3} fill="none" stroke="var(--seam-color)" strokeDasharray="3 3" />}
            <rect
              className={phase === 0 ? 'dcf-bar fill-accent' : 'fill-accent'}
              x={x}
              y={BASE - h}
              width={bw}
              height={h}
              rx={3}
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'bottom',
                transform: `scaleY(${k})`,
                transition: `transform 1100ms cubic-bezier(0.22,1,0.36,1) ${i * 70}ms`,
                animationDelay: `${i * 80}ms`,
              }}
            />
            {(!compact || i % 3 === 0 || i === n - 1) && (
              <text x={x + bw / 2} y={BASE + 20} textAnchor="middle" className={label}>
                {`'${String(s.baseYear + i + 1).slice(2)}`}
              </text>
            )}
            {phase >= 1 && (i === 0 || i === n - 1) && (
              <text x={x + bw / 2} y={BASE - h * k - 8} textAnchor="middle" className={`${value} fade-up`} style={{ animationDelay: '900ms' }}>
                {`×${df[i].toFixed(2)}`}
              </text>
            )}
          </g>
        );
      })}
      {phase === 0 && (
        <text x={70} y={TOP} className={`${label} fade-up`} style={{ animationDelay: '900ms' }}>
          free cash flow, FY{String(s.baseYear + 1).slice(2)}–FY{String(s.baseYear + n).slice(2)}
        </text>
      )}
      {showTv && (
        <g className="fade-up">
          {[
            { k: compact ? 'Yr 1–10' : 'Years 1–10', v: sumPv, x: W - (compact ? 175 : 230) },
            { k: compact ? 'After' : 'After year 10', v: pvTv, x: W - (compact ? 88 : 130) },
          ].map((b, i) => (
            <g key={b.k}>
              <rect
                className="dcf-bar"
                x={b.x}
                y={BASE - b.v * tvScale}
                width={compact ? 64 : 70}
                height={b.v * tvScale}
                rx={3}
                fill={i ? 'rgb(var(--accent))' : 'rgb(var(--accent) / 0.45)'}
                style={{ animationDelay: `${300 + i * 300}ms` }}
              />
              <text x={b.x + 35} y={BASE - b.v * tvScale - 8} textAnchor="middle" className={value}>
                {money(b.v)}
              </text>
              <text x={b.x + 35} y={BASE + 20} textAnchor="middle" className={label}>
                {b.k}
              </text>
            </g>
          ))}
          <text x={W - (compact ? 115 : 165)} y={TOP} textAnchor="middle" className={`fill-accent font-mono ${compact ? 'text-[16px]' : 'text-[13px]'}`}>
            {pct(ev ? pvTv / ev : null, 0)} of today&apos;s value
          </text>
        </g>
      )}
    </g>
  );
}

function Bridge({ s }: { s: Story }) {
  const { W, compact } = useDims();
  const { label, value, big } = useText();
  void compact;
  void big;
  const ev = s.f.ev?.[0] ?? 0;
  const eq = s.f.equity?.[0] ?? ev - s.debt + s.cashLike;
  const items = [
    { k: compact ? 'Firm' : 'Enterprise value', from: 0, to: ev, total: true },
    { k: '− Debt', from: ev, to: ev - s.debt },
    { k: compact ? '+ Cash' : '+ Cash and investments', from: ev - s.debt, to: ev - s.debt + s.cashLike },
    { k: compact ? 'Equity' : 'Equity value', from: 0, to: eq, total: true },
  ];
  const hi = Math.max(1, ...items.flatMap((i) => [i.from, i.to]));
  const lo = Math.min(0, ...items.flatMap((i) => [i.from, i.to]));
  const y = (v: number) => BASE - ((v - lo) / (hi - lo)) * (BASE - TOP - 30);
  const step = (W - 160) / items.length;
  const bw = Math.min(110, step - 40);
  return (
    <g>
      {items.map((it, i) => {
        const x = 90 + i * step + (step - bw) / 2;
        const top = y(Math.max(it.from, it.to));
        const h = Math.max(2, Math.abs(y(it.from) - y(it.to)));
        return (
          <g key={it.k} className="fade-up" style={{ animationDelay: `${i * 450}ms` }}>
            <rect x={x} y={top} width={bw} height={h} rx={3} className={it.total ? 'fill-accent' : it.to < it.from ? 'fill-panel-strong' : 'fill-accent/40'} stroke={it.total ? 'none' : 'var(--seam-color)'} />
            {i < items.length - 1 && <line x1={x + bw} x2={x + step} y1={y(it.to)} y2={y(it.to)} stroke="var(--seam-color)" strokeDasharray="3 3" />}
            <text x={x + bw / 2} y={top - 8} textAnchor="middle" className={value}>
              {money(it.total ? it.to : it.to - it.from)}
            </text>
            <text x={x + bw / 2} y={BASE + 20} textAnchor="middle" className={label}>
              {it.k}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function PerShare({ s, reduced }: { s: Story; reduced: boolean }) {
  const { W, compact } = useDims();
  const { label, value, big } = useText();
  void compact;
  void big;
  // One row per model, FCFF (the model this walkthrough followed) first; the share price is a vertical line across all.
  const rows = s.models.length ? s.models : [{ id: 'fcff' as ModelId, label: 'FCFF DCF', short: 'FCFF', v: s.perShare }];
  const nameW = compact ? 150 : 170;
  const x0 = nameW + 10;
  const x1 = W - (compact ? 150 : 170);
  const max = Math.max(...rows.map((r) => r.v), s.price ?? 0, 1) * 1.05;
  const x = (v: number) => x0 + (v / max) * (x1 - x0);
  const top = TOP + 26;
  const rowH = Math.min(compact ? 52 : 44, (BASE - top - 6) / rows.length);
  const bh = Math.min(26, rowH - 12);
  return (
    <g>
      {rows.map((r, i) => {
        const yy = top + i * rowH;
        const main = i === 0;
        const d = s.price ? r.v / s.price - 1 : null;
        return (
          <g key={r.id}>
            <text x={nameW} y={yy + bh / 2 + 5} textAnchor="end" className={main ? `fill-accent font-mono ${compact ? 'text-[16px]' : 'text-[12px]'} font-semibold` : label}>
              {compact ? r.short : r.label}
            </text>
            <rect
              className={`dcf-bar-x ${main ? 'fill-accent' : 'fill-accent/30'}`}
              x={x0}
              y={yy}
              width={Math.max(2, x(r.v) - x0)}
              height={bh}
              rx={3}
              stroke={main ? 'none' : 'var(--seam-color)'}
              style={{ animationDelay: `${200 + i * 160}ms` }}
            />
            <text x={x(r.v) + 8} y={yy + bh / 2 + 5} className={`${main ? 'fill-ink font-semibold' : 'fill-ink'} font-mono ${compact ? 'text-[16px]' : 'text-[12px]'} fade-up`} style={{ animationDelay: `${500 + i * 160}ms` }}>
              {main ? <CountUp to={r.v} reduced={reduced} format={(v) => fmt(v, 'usd')} /> : fmt(r.v, 'usd')}
              {d != null && <tspan className="fill-muted">{` ${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(0)}%`}</tspan>}
            </text>
          </g>
        );
      })}
      {s.price != null && (
        <g>
          <line
            className="dcf-thread"
            x1={x(s.price)}
            x2={x(s.price)}
            y1={BASE}
            y2={top - 14}
            stroke="rgb(var(--ink))"
            strokeWidth={1.5}
            style={{ ['--len' as string]: 400, animationDelay: `${300 + rows.length * 160}ms` }}
          />
          <text x={x(s.price)} y={top - 22} textAnchor="middle" className={`fill-ink font-mono ${compact ? 'text-[16px]' : 'text-[12px]'} fade-up`} style={{ animationDelay: `${600 + rows.length * 160}ms` }}>
            share price {fmt(s.price, 'usd')}
          </text>
        </g>
      )}
      <text x={x0} y={BASE + 22} className={`${label} fade-up`} style={{ animationDelay: '1200ms' }}>
        {compact ? 'top row: the model this walkthrough followed' : 'top row: the model this walkthrough followed · % = difference from the share price'}
      </text>
    </g>
  );
}

function Implied({ s }: { s: Story }) {
  const { W, compact } = useDims();
  const { label, value, big } = useText();
  void compact;
  void big;
  // Three growth rates side by side: what the company did, what the FCFF model assumes, and what the price needs.
  const g = [
    ...(s.pastGrowth != null ? [{ k: compact ? 'Past 3 yrs' : 'Last 3 years', sub: 'median, actual', v: s.pastGrowth, cls: 'fill-panel-strong', stroke: true }] : []),
    { k: compact ? 'FCFF model' : 'FCFF model assumes', sub: compact ? 'assumes' : 'this walkthrough', v: s.g1, cls: 'fill-accent/40', stroke: true },
    ...(s.reverse != null ? [{ k: compact ? 'Price' : 'The price implies', sub: compact ? 'implies' : 'reverse FCFF', v: s.reverse, cls: 'fill-accent', stroke: false }] : []),
  ];
  const max = Math.max(0.05, ...g.map((x) => Math.abs(x.v))) * 1.2;
  const y = (v: number) => BASE - (Math.max(0, v) / max) * (BASE - TOP - 50);
  const gap = compact ? 170 : 230;
  const bw = compact ? 110 : 120;
  const cxOf = (i: number) => W / 2 + (i - (g.length - 1) / 2) * gap;
  return (
    <g>
      {g.map((b, i) => (
        <g key={b.k}>
          <rect className={`dcf-bar ${b.cls}`} x={cxOf(i) - bw / 2} y={y(b.v)} width={bw} height={Math.max(2, BASE - y(b.v))} rx={4} stroke={b.stroke ? 'var(--seam-color)' : 'none'} style={{ animationDelay: `${i * 350}ms` }} />
          <text x={cxOf(i)} y={y(b.v) - 14} textAnchor="middle" className={`fill-ink font-mono ${big} fade-up`} style={{ animationDelay: `${300 + i * 350}ms` }}>
            {pct(b.v)}
          </text>
          <text x={cxOf(i)} y={BASE + 22} textAnchor="middle" className={`fill-ink font-mono ${compact ? 'text-[16px]' : 'text-[12px]'}`}>
            {b.k}
          </text>
          <text x={cxOf(i)} y={BASE + (compact ? 42 : 38)} textAnchor="middle" className={label}>
            {b.sub}
          </text>
        </g>
      ))}
      <text x={W / 2} y={TOP} textAnchor="middle" className={label}>
        revenue growth a year, years 1–5
      </text>
    </g>
  );
}

/** One sentence on how the other models compare with FCFF: agreement is reassuring, a wide spread is information. */
function ModelSpread({ s }: { s: Story }) {
  const others = s.models.slice(1);
  const vs = others.map((m) => m.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const above = s.price != null ? s.models.filter((m) => m.v >= s.price!).length : null;
  return (
    <>
      {' '}
      The other {others.length} models land between {fmt(lo, 'usd')} and {fmt(hi, 'usd')}
      {above != null ? `; ${above} of ${s.models.length} ${above === 1 ? 'is' : 'are'} above the price` : ''}.
    </>
  );
}

function Caption({ s, step, reduced }: { s: Story; step: number; reduced: boolean }) {
  const first = s.revenue.find((v) => v != null);
  const last = s.revenue.at(-1);
  const ev = s.f.ev?.[0] ?? 0;
  const pvTv = s.f.pv_tv?.[10] ?? 0;
  const gap = s.price ? s.perShare / s.price - 1 : null;
  switch (step) {
    case 0:
      return (
        <>
          Revenue went from {money(first)} to {money(last)} over {s.years.length} years. Every dollar of sales now leaves {pct(s.margin.at(-1), 0)} as operating income.
        </>
      );
    case 1:
      return (
        <>
          Next year&apos;s operating income of {money(s.f.ebit?.[1])} becomes {money(s.f.fcff?.[1])} of cash the business can pay out, after tax at {pct(s.tax, 0)} and what it must reinvest.
        </>
      );
    case 2:
      return (
        <>
          Revenue grows {pct(s.g1)} a year for five years, then slows to {pct(s.gT)}. These are the cash flows the business should produce.
        </>
      );
    case 3:
      return (
        <>
          Money later is worth less than money now. At a {pct(s.wacc)} cost of capital, a dollar in year 10 is worth {fmt(s.f.df?.[10] ?? null, 'usd')} today.
        </>
      );
    case 4:
      return (
        <>
          The business does not stop after year 10. Growing at {pct(s.gT)} forever, those later years carry {pct(ev ? pvTv / ev : null, 0)} of the value.
        </>
      );
    case 5:
      return <>The whole business is worth {money(ev)}. Lenders are paid first; the cash on hand belongs to shareholders.</>;
    case 6:
      return (
        <>
          Split across {s.shares.toLocaleString('en-US', { maximumFractionDigits: 0 })}M shares, FCFF gives <CountUp to={s.perShare} reduced={reduced} format={(x) => fmt(x, 'usd')} /> a share
          {gap != null ? `, ${Math.abs(gap * 100).toFixed(0)}% ${gap >= 0 ? 'above' : 'below'} the ${fmt(s.price, 'usd')} price` : ''}.
          {s.models.length > 1 && <ModelSpread s={s} />}
        </>
      );
    default:
      return s.reverse != null ? (
        <>
          Keeping everything else in the FCFF model fixed, today&apos;s price needs revenue to grow {pct(s.reverse)} a year for five years. The model assumes {pct(s.g1)}
          {s.pastGrowth != null ? `; the last three years ran at ${pct(s.pastGrowth)}` : ''}. The question is which you believe.
        </>
      ) : (
        <>No growth rate in a sensible range matches the price under these assumptions, which itself says the market sees this business differently.</>
      );
  }
}
