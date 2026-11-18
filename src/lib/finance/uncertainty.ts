/**
 * How much the answer depends on the assumptions.
 *
 * Tornado: move one input at a time between a low and a high value and record the value per share.
 * Monte Carlo: draw all inputs at once from ranges grounded in the company's own history, many times over.
 * Both re-run the same workbook the page shows (FCFF, or residual income for banks and insurers).
 */
import { evaluate, type Workbook } from './calcsheet';
import type { Historicals } from './types';

/* ------------------------------------------------------------------ Shared ------------------------------------------------------------------ */

/** The headline model whose value is varied: residual income for banks and insurers, FCFF for everyone else. */
export const targetSheet = (financial: boolean) => (financial ? { name: 'ResidualIncome', row: 'per_share' } : { name: 'FCFF', row: 'per_share' });

export function valueWith(wb: Workbook, overrides: Record<string, number>, financial: boolean): number | null {
  const t = targetSheet(financial);
  try {
    const v = evaluate(wb, overrides).sheets[t.name]?.[t.row]?.[0];
    return v != null && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ Tornado ------------------------------------------------------------------ */

export interface TornadoRow {
  key: string;
  label: string;
  /** Plain name for sentences ("the discount rate"). */
  short: string;
  fmt: 'pct' | 'beta';
  low: number;
  high: number;
  /** Value per share at the low and high input. */
  atLow: number | null;
  atHigh: number | null;
  /** Width of the bar: |atHigh - atLow|. */
  swing: number;
}

export interface TornadoInputs {
  wacc: number | null;
  re: number | null;
  beta: number;
  betaSe: number | null;
  g1: number;
  gT: number;
  marginTarget: number | null;
  capexPct: number;
  nwcPct: number;
  tax: number;
  roe: number | null;
}

/** Ranges used for each input (also shown on the page). */
export function tornadoRanges(i: TornadoInputs, financial: boolean) {
  const betaSpread = Math.max(0.2, i.betaSe != null ? 1.96 * i.betaSe : 0);
  const rows: { key: string; label: string; short: string; fmt: 'pct' | 'beta'; low: number; high: number }[] = [];
  if (financial) {
    if (i.re != null) rows.push({ key: 're', label: 'Cost of equity ±1 pt', short: 'the cost of equity', fmt: 'pct', low: i.re - 0.01, high: i.re + 0.01 });
    if (i.roe != null) rows.push({ key: 'roe', label: 'Return on equity ±3 pts', short: 'return on equity', fmt: 'pct', low: i.roe - 0.03, high: i.roe + 0.03 });
    rows.push({ key: 'g_stage1', label: 'Book growth, yrs 1–5 ±3 pts', short: 'book equity growth', fmt: 'pct', low: i.g1 - 0.03, high: i.g1 + 0.03 });
  } else {
    if (i.wacc != null) rows.push({ key: 'wacc', label: 'WACC ±1 pt', short: 'the discount rate (WACC)', fmt: 'pct', low: i.wacc - 0.01, high: i.wacc + 0.01 });
    rows.push({ key: 'g_stage1', label: 'Revenue growth, year 1 ±5 pts', short: 'revenue growth', fmt: 'pct', low: i.g1 - 0.05, high: i.g1 + 0.05 });
    if (i.marginTarget != null) rows.push({ key: 'margin_target', label: 'Target margin ±3 pts', short: 'the target margin', fmt: 'pct', low: i.marginTarget - 0.03, high: i.marginTarget + 0.03 });
    rows.push({ key: 'capex_pct', label: 'Capex, % of revenue ±25%', short: 'capital spending', fmt: 'pct', low: i.capexPct * 0.75, high: i.capexPct * 1.25 });
    rows.push({ key: 'nwc_pct', label: 'Working capital ±5 pts', short: 'working capital', fmt: 'pct', low: Math.max(0, i.nwcPct - 0.05), high: i.nwcPct + 0.05 });
    rows.push({ key: 'tax', label: 'Tax rate ±5 pts', short: 'the tax rate', fmt: 'pct', low: Math.max(0, i.tax - 0.05), high: i.tax + 0.05 });
  }
  rows.push({ key: 'g_terminal', label: 'Terminal growth ±0.5 pt', short: 'long-run growth', fmt: 'pct', low: i.gT - 0.005, high: i.gT + 0.005 });
  rows.push({
    key: 'beta_l',
    label: i.betaSe != null ? 'Beta, 95% range of the regression' : 'Beta ±0.2',
    short: 'beta',
    fmt: 'beta',
    low: Math.max(0.1, i.beta - betaSpread),
    high: i.beta + betaSpread,
  });
  return rows;
}

/** One-at-a-time sensitivity, widest swing first. */
export function tornado(wb: Workbook, i: TornadoInputs, financial: boolean): TornadoRow[] {
  return tornadoRanges(i, financial)
    .map((r) => {
      const atLow = valueWith(wb, { [r.key]: r.low }, financial);
      const atHigh = valueWith(wb, { [r.key]: r.high }, financial);
      return { ...r, atLow, atHigh, swing: atLow != null && atHigh != null ? Math.abs(atHigh - atLow) : 0 };
    })
    .sort((x, y) => y.swing - x.swing);
}

/* ---------------------------------------------------------------- Monte Carlo ---------------------------------------------------------------- */

/** Small, fast, seedable generator (mulberry32): the same seed always gives the same draws. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw (Box–Muller). */
export function normal(u: () => number) {
  const a = Math.max(u(), 1e-12);
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
}

/** Triangular draw between lo and hi with the given mode. */
export function triangular(u: () => number, lo: number, mode: number, hi: number) {
  const x = u();
  const c = (mode - lo) / (hi - lo || 1);
  return x < c ? lo + Math.sqrt(x * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - x) * (hi - lo) * (hi - mode));
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sd = (xs: number[]) => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

export interface McParams {
  g1: { mean: number; sd: number };
  margin: { mean: number; sd: number } | null;
  roe: { mean: number; sd: number } | null;
  beta: { mean: number; sd: number };
  gT: { lo: number; mode: number; hi: number };
  capex: { mean: number; spread: number } | null;
  /** Correlation between growth and margin draws. */
  rho: number;
}

/** Ranges from the company's own ten-year history; spreads are bounded so one odd year cannot dominate. */
export function mcParams(h: Historicals, i: TornadoInputs, financial: boolean): McParams {
  const rev = (h.items.revenue ?? []).map((v) => v?.value ?? null);
  const growth = rev.map((r, k) => (k && r != null && rev[k - 1] ? r / rev[k - 1]! - 1 : NaN)).filter(Number.isFinite);
  const ebit = (h.items.operatingIncome ?? []).map((v) => v?.value ?? null);
  const margins = rev.map((r, k) => (r && ebit[k] != null ? ebit[k]! / r : NaN)).filter(Number.isFinite);
  const ni = (h.items.netIncome ?? []).map((v) => v?.value ?? null);
  const eq = (h.items.equity ?? []).map((v) => v?.value ?? null);
  const roes = ni.map((n, k) => (n != null && eq[k] ? n / eq[k]! : NaN)).filter(Number.isFinite);
  return {
    // Banks: the input is average book growth over five years, so its spread is the yearly spread / √5. Others: the
    // input is one year's revenue growth (it fades after that), so its spread is the yearly spread itself.
    g1: financial
      ? { mean: i.g1, sd: clamp((sd(growth) ?? 0.08) / Math.sqrt(5), 0.01, 0.08) }
      : { mean: i.g1, sd: clamp(sd(growth) ?? 0.1, 0.02, 0.25) },
    margin: !financial && i.marginTarget != null ? { mean: i.marginTarget, sd: clamp(sd(margins) ?? 0.03, 0.01, 0.1) } : null,
    roe: financial && i.roe != null ? { mean: i.roe, sd: clamp(sd(roes) ?? 0.03, 0.01, 0.06) } : null,
    beta: { mean: i.beta, sd: i.betaSe != null ? clamp(i.betaSe, 0.05, 0.5) : 0.15 },
    gT: { lo: 0.015, mode: clamp(i.gT, 0.015, 0.03), hi: 0.03 },
    capex: financial ? null : { mean: i.capexPct, spread: 0.2 },
    rho: 0.3,
  };
}

export interface McResult {
  values: number[];
  /** Draws that broke the model (discount rate at or below growth, or no value). */
  invalid: number;
}

/** Run `n` draws; call repeatedly with the same generator to build up a sample in chunks. */
export function simulate(wb: Workbook, p: McParams, n: number, u: () => number, financial: boolean): McResult {
  const t = targetSheet(financial);
  const values: number[] = [];
  let invalid = 0;
  for (let k = 0; k < n; k++) {
    const z1 = normal(u);
    const z2 = p.rho * z1 + Math.sqrt(1 - p.rho * p.rho) * normal(u);
    const o: Record<string, number> = {
      g_stage1: financial ? clamp(p.g1.mean + p.g1.sd * z1, -0.2, 0.5) : clamp(p.g1.mean + p.g1.sd * z1, -0.5, 1.5),
      beta_l: Math.max(0.1, p.beta.mean + p.beta.sd * normal(u)),
      g_terminal: triangular(u, p.gT.lo, p.gT.mode, p.gT.hi),
    };
    if (p.margin) o.margin_target = clamp(p.margin.mean + p.margin.sd * z2, -0.5, 0.9);
    if (p.roe) o.roe = clamp(p.roe.mean + p.roe.sd * z2, -0.3, 0.6);
    if (p.capex) o.capex_pct = Math.max(0, p.capex.mean * (1 - p.capex.spread + 2 * p.capex.spread * u()));
    // The discount rate follows the drawn beta; a draw where it no longer clears terminal growth breaks the
    // perpetuity formula, so it is counted as invalid rather than kept as a huge or negative value.
    let v: number | null = null;
    try {
      const ev = evaluate(wb, o);
      const rate = financial ? ev.inputs.re : ev.inputs.wacc;
      if (rate != null && rate > o.g_terminal + 0.005) v = ev.sheets[t.name]?.[t.row]?.[0] ?? null;
    } catch {
      v = null;
    }
    if (v == null || !Number.isFinite(v)) invalid++;
    else values.push(v);
  }
  return { values, invalid };
}

export interface McSummary {
  n: number;
  p10: number;
  p50: number;
  p90: number;
  /** Share of draws above the price. */
  aboveprice: number | null;
  bins: { from: number; to: number; count: number }[];
}

export function summarize(values: number[], price: number | null, nBins = 32): McSummary | null {
  if (values.length < 10) return null;
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  // Bin between the 1st and 99th percentile so a few extreme draws do not flatten the chart.
  const lo = q(0.01);
  const hi = q(0.99);
  const w = (hi - lo) / nBins || 1;
  const bins = Array.from({ length: nBins }, (_, k) => ({ from: lo + k * w, to: lo + (k + 1) * w, count: 0 }));
  for (const v of s) bins[Math.min(nBins - 1, Math.max(0, Math.floor((v - lo) / w)))].count++;
  return { n: s.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), aboveprice: price != null ? s.filter((v) => v > price).length / s.length : null, bins };
}
