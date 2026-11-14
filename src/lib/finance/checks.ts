/**
 * Data checks. The SEC data is what companies filed; the risk is in how this code reads it (which tag, which
 * period, which recipe). These checks test the extracted figures against other figures in the same filing, so
 * they need no outside source and run in tests and in the monthly snapshot.
 *
 * error: the extraction is almost certainly wrong for this company (fix the code, or list it in
 *        tests/data-exceptions.json with the reason).
 * warn:  unusual but often genuine (mergers, one-offs); shown in the QA report, never fails a build.
 */
import { at, latest } from './extract';
import type { Historicals, TrimmedFacts } from './types';

export type Severity = 'error' | 'warn';

export interface CheckIssue {
  id: string;
  severity: Severity;
  message: string;
}

export interface CheckContext {
  /** Banks, insurers and similar: revenue, debt and cash mean different things and their models do not use them. */
  financial?: boolean;
  price?: number | null;
  /** Nasdaq market capitalisation in dollars, if known. */
  marketCap?: number | null;
  /** Shares the valuation actually uses, in units (after the market-cap cross-check). */
  sharesUsed?: number | null;
  /** Today's date, ISO, for staleness. */
  today?: string;
}

const M = 1e6;
const fmt = (x: number) => `$${(x / M).toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);

/** Fact for a fiscal year from the trimmed filing, matched on the year's end date (flows: ~12-month periods). */
function flowAt(t: TrimmedFacts, tag: string, end: string): number | null {
  let best: { val: number; filed: string } | null = null;
  for (const r of t.tags[tag] ?? []) {
    if (r.end !== end || !r.start || !r.form.startsWith('10-K')) continue;
    const len = (Date.parse(r.end) - Date.parse(r.start)) / 86_400_000;
    if (len < 350 || len > 380) continue;
    if (!best || r.filed > best.filed) best = r;
  }
  return best?.val ?? null;
}

export function checkCompany(h: Historicals, t: TrimmedFacts, ctx: CheckContext = {}): CheckIssue[] {
  const out: CheckIssue[] = [];
  const add = (id: string, severity: Severity, message: string) => out.push({ id, severity, message });
  const end = h.yearEnds.at(-1);
  if (!end) return [{ id: 'no-annual-data', severity: 'error', message: 'No annual 10-K data was extracted.' }];

  const rev = latest(h, 'revenue');
  const ni = latest(h, 'netIncome');
  const eq = latest(h, 'equity');
  const ebit = latest(h, 'operatingIncome');
  const debt = latest(h, 'debt');
  const cash = latest(h, 'cash');
  const da = latest(h, 'da');
  const dil = latest(h, 'dilutedShares');
  const assets = at(t, 'Assets', end)?.val ?? null;
  const liabEq = at(t, 'LiabilitiesAndStockholdersEquity', end)?.val ?? null;
  const liabilities = at(t, 'Liabilities', end)?.val ?? (liabEq != null && eq != null ? liabEq - eq : null);

  // 1. Core items must exist for the latest fiscal year.
  for (const [k, v] of [['net income', ni], ['book equity', eq]] as const) if (v == null) add('missing-core', 'error', `No ${k} for FY ending ${end}.`);
  if (!ctx.financial && rev == null) add('missing-core', 'error', `No revenue for FY ending ${end}.`);

  // 2. Net income / diluted shares must reproduce the EPS the company reports. Tests the net-income tag choice
  //    (e.g. picking profit including minority interests) and the share count together.
  const eps = flowAt(t, 'EarningsPerShareDiluted', end);
  if (eps != null && ni != null && dil && Math.abs(eps) >= 0.05) {
    const implied = ni / dil;
    const gap = rel(implied, eps);
    // Preferred dividends, discontinued operations and two-class EPS move this a little; a large gap is a wrong tag.
    if (gap > 0.15 && Math.abs(implied - eps) > 0.1)
      add('eps', gap > 0.4 ? 'error' : 'warn', `Net income / diluted shares = ${implied.toFixed(2)}, but the filing reports diluted EPS of ${eps.toFixed(2)}.`);
  }

  // 3. Balance sheet bounds.
  if (assets != null) {
    if (cash != null && cash > assets * 1.001) add('cash-gt-assets', 'error', `Cash ${fmt(cash)} exceeds total assets ${fmt(assets)}.`);
    if (eq != null && eq > assets * 1.001) add('equity-gt-assets', 'error', `Equity ${fmt(eq)} exceeds total assets ${fmt(assets)}.`);
    if (liabEq != null && rel(liabEq, assets) > 0.001) add('balance', 'warn', `Assets ${fmt(assets)} differ from liabilities + equity ${fmt(liabEq)}.`);
  }
  if (!ctx.financial && debt != null && liabilities != null && liabilities > 0 && debt > liabilities * 1.02)
    add('debt-gt-liabilities', 'error', `Debt ${fmt(debt)} exceeds total liabilities ${fmt(liabilities)}: a line is counted twice.`);

  // 4. Income statement bounds (non-financial firms).
  if (!ctx.financial && rev != null && rev > 0) {
    if (ebit != null && ebit > rev * 1.001) add('ebit-gt-revenue', 'error', `Operating income ${fmt(ebit)} exceeds revenue ${fmt(rev)}.`);
    if (ebit != null && ebit < -rev) add('ebit-loss', 'warn', `Operating loss ${fmt(ebit)} is larger than revenue ${fmt(rev)}.`);
    if (da != null && da > rev * 0.6) add('da-high', 'warn', `D&A ${fmt(da)} is over 60% of revenue.`);
  }

  // 5. Year-on-year jumps usually mean a tag switch, not a business change.
  const revs = h.items.revenue ?? [];
  const [r0, r1] = [revs.at(-2), revs.at(-1)];
  if (!ctx.financial && r0 && r1 && r0.value > 0) {
    const ratio = r1.value / r0.value;
    if (ratio > 3 || ratio < 1 / 3)
      add('revenue-jump', r0.tag !== r1.tag ? 'error' : 'warn', `Revenue moved ${ratio.toFixed(1)}x in a year (${r0.tag} -> ${r1.tag}).`);
  }

  // 6. Implied interest rate on debt.
  const interest = latest(h, 'interestExpense');
  if (!ctx.financial && interest != null && debt != null && debt > 0 && interest > 0) {
    const rate = interest / debt;
    if (rate > 0.25) add('debt-low', 'warn', `Interest of ${fmt(interest)} on debt of ${fmt(debt)} implies ${(rate * 100).toFixed(0)}%: debt is probably incomplete.`);
  }
  if (!ctx.financial && (debt == null || debt === 0) && interest != null && rev && interest > 0.002 * rev)
    add('debt-missing', 'warn', `No debt found, yet interest expense is ${fmt(interest)}.`);

  // 7. Shares the model uses must give the market cap.
  if (ctx.price && ctx.marketCap && ctx.sharesUsed) {
    const gap = rel(ctx.price * ctx.sharesUsed, ctx.marketCap);
    if (gap > 0.25) add('market-cap', 'error', `Price x shares is ${(gap * 100).toFixed(0)}% away from the market cap.`);
  }

  // 8. Staleness.
  const today = ctx.today ?? new Date().toISOString().slice(0, 10);
  if ((Date.parse(today) - Date.parse(end)) / 86_400_000 > 16 * 30) add('stale', 'warn', `Latest annual data is for the fiscal year ending ${end}.`);

  return out;
}

export interface ReferenceFigures {
  /** Same fiscal year, $ (not millions). Missing values are skipped. */
  revenue?: number | null;
  netIncome?: number | null;
  equity?: number | null;
}

/**
 * Compare against an independently compiled source (Nasdaq's statements). Only items that should agree exactly
 * are compared: revenue, net income and equity. Debt and D&A differ by definition and are not compared.
 * Banks are compared on net income and equity only.
 */
export function compareReference(h: Historicals, ref: ReferenceFigures, financial = false): CheckIssue[] {
  const out: CheckIssue[] = [];
  const items: [string, number | null, number | null | undefined][] = [
    ['net income', latest(h, 'netIncome'), ref.netIncome],
    ['equity', latest(h, 'equity'), ref.equity],
  ];
  if (!financial) items.unshift(['revenue', latest(h, 'revenue'), ref.revenue]);
  for (const [k, ours, theirs] of items) {
    if (ours == null || theirs == null || theirs === 0) continue;
    const gap = rel(ours, theirs);
    if (gap > 0.1) out.push({ id: `ref-${k.replace(' ', '-')}`, severity: 'warn', message: `${k}: ${fmt(ours)} here vs ${fmt(theirs)} at Nasdaq (${(gap * 100).toFixed(0)}% apart).` });
  }
  return out;
}

/** Share of comparable items within 2% of the reference, per item. Used by the snapshot gate. */
export function matchRate(pairs: [number | null, number | null | undefined][]): { n: number; within2: number } {
  let n = 0;
  let within2 = 0;
  for (const [a, b] of pairs) {
    if (a == null || b == null || b === 0) continue;
    n++;
    if (rel(a, b) <= 0.02) within2++;
  }
  return { n, within2 };
}

export { M as MILLION };
