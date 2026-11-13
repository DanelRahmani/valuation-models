import type { BetaStats } from './types';

export interface PricePoint {
  date: string; // YYYY-MM-DD
  close: number;
}

/** Last close of each calendar month, keyed YYYY-MM. */
function monthEnds(p: PricePoint[]): Map<string, number> {
  const m = new Map<string, { date: string; close: number }>();
  for (const x of p) {
    const k = x.date.slice(0, 7);
    const prev = m.get(k);
    if (!prev || x.date > prev.date) m.set(k, x);
  }
  return new Map([...m].map(([k, v]) => [k, v.close]));
}

/** ISO-week key for weekly alignment. */
function weekKey(d: string) {
  const t = new Date(d + 'T00:00:00Z');
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function weekEnds(p: PricePoint[]): Map<string, number> {
  const m = new Map<string, { date: string; close: number }>();
  for (const x of p) {
    const k = weekKey(x.date);
    const prev = m.get(k);
    if (!prev || x.date > prev.date) m.set(k, x);
  }
  return new Map([...m].map(([k, v]) => [k, v.close]));
}

export interface AlignedReturns {
  periods: string[];
  stock: number[];
  market: number[];
}

/**
 * Align two price series on period ends and compute simple returns.
 * The current (incomplete) period is dropped. `maxPeriods` keeps the most recent window.
 */
export function alignReturns(
  stock: PricePoint[],
  market: PricePoint[],
  freq: 'monthly' | 'weekly' = 'monthly',
  maxPeriods = freq === 'monthly' ? 60 : 104,
): AlignedReturns {
  const f = freq === 'monthly' ? monthEnds : weekEnds;
  const s = f(stock);
  const m = f(market);
  const keys = [...s.keys()].filter((k) => m.has(k)).sort();
  const lastDate = [stock.at(-1)?.date ?? '', market.at(-1)?.date ?? ''].sort()[0];
  const currentKey = freq === 'monthly' ? lastDate.slice(0, 7) : weekKey(lastDate);
  // Drop the in-progress period unless the data ends on its final trading day (unknowable), so always drop it.
  if (keys.at(-1) === currentKey) keys.pop();
  const window = keys.slice(-(maxPeriods + 1));
  const out: AlignedReturns = { periods: [], stock: [], market: [] };
  for (let i = 1; i < window.length; i++) {
    out.periods.push(window[i]);
    out.stock.push(s.get(window[i])! / s.get(window[i - 1])! - 1);
    out.market.push(m.get(window[i])! / m.get(window[i - 1])! - 1);
  }
  return out;
}

/** OLS of stock returns on market returns. */
export function regress(r: AlignedReturns): BetaStats {
  const n = r.stock.length;
  if (n < 12) throw new Error(`Only ${n} overlapping periods; at least 12 are needed for a beta.`);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const ms = mean(r.stock);
  const mm = mean(r.market);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (r.market[i] - mm) * (r.stock[i] - ms);
    sxx += (r.market[i] - mm) ** 2;
    syy += (r.stock[i] - ms) ** 2;
  }
  const beta = sxy / sxx;
  const alpha = ms - beta * mm;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (r.stock[i] - alpha - beta * r.market[i]) ** 2;
  return {
    beta,
    alpha,
    r2: 1 - sse / syy,
    se: Math.sqrt(sse / (n - 2) / sxx),
    n,
    blume: 0.67 * beta + 0.33,
  };
}

export function regressBeta(stock: PricePoint[], market: PricePoint[], freq: 'monthly' | 'weekly' = 'monthly') {
  const aligned = alignReturns(stock, market, freq);
  return { aligned, stats: regress(aligned) };
}

/** Hamada. */
export const unlever = (beta: number, de: number, tax: number) => beta / (1 + (1 - tax) * de);
export const relever = (betaU: number, de: number, tax: number) => betaU * (1 + (1 - tax) * de);

/** Parse Nasdaq, Yahoo or generic Date,Close CSV text. Ascending by date. */
export function parsePriceCsv(text: string): PricePoint[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const di = header.indexOf('date');
  let ci = header.indexOf('adj close');
  if (ci < 0) ci = header.indexOf('close/last');
  if (ci < 0) ci = header.indexOf('close');
  if (di < 0 || ci < 0) throw new Error('Unrecognised price file: it needs a Date column and a Close (or Close/Last, Adj Close) column.');
  const out: PricePoint[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const close = Number(cols[ci]?.replace(/[$\s]/g, ''));
    const raw = cols[di];
    if (!raw || !Number.isFinite(close) || close <= 0) continue;
    let date = raw;
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
    if (us) date = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
    out.push({ date: date.slice(0, 10), close });
  }
  if (out.length < 30) throw new Error('The price file has too few rows to estimate a beta.');
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
