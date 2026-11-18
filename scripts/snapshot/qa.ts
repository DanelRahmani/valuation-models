/**
 * Quality gate for the monthly snapshot. Two kinds of evidence:
 *  1. Accounting checks inside each filing (src/lib/finance/checks.ts): no outside data needed.
 *  2. A cross-check of revenue, net income and equity against Nasdaq's independently compiled statements.
 * The snapshot writes public/data/qa.json with the results and refuses to publish if the extraction looks broken
 * (match rates fall, or unexplained check errors appear on more than a handful of companies).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkCompany, compareReference, matchRate, type CheckIssue } from '../../src/lib/finance/checks';
import { extractHistoricals, latest, trimCompanyfacts } from '../../src/lib/finance/extract';
import { defaultAssumptions, isFinancialFirm } from '../../src/lib/finance/assumptions';
import type { CompanyFile, MarketFile } from '../../src/lib/finance/types';
import type { NasdaqAnnual } from './sources';

export interface QaFile {
  asOf: string;
  summary: {
    companies: number;
    errors: number;
    unexplainedErrors: number;
    warnings: number;
    reference: Record<'revenue' | 'netIncome' | 'equity', { compared: number; within2pct: number; rate: number }>;
    referenceUnavailable: number;
  };
  companies: Record<string, CheckIssue[]>;
  /** Per company: relative gap to Nasdaq for each compared item (0.01 = 1%), for the data-quality badge. */
  reference: Record<string, Partial<Record<'revenue' | 'netIncome' | 'equity', number>>>;
  /** Companies whose new data failed a check this run: they keep last month's file. Ticker -> the failing checks. */
  heldBack?: Record<string, string[]>;
  /** Entries in tests/data-exceptions.json that no longer occur and can be removed. */
  staleExceptions?: string[];
}

/** Thresholds below which the snapshot is not published. Measured Nov 2026: revenue 97%, net income 96%, equity 99%. */
export const GATE = { minMatchRate: 0.9, minCompared: 100, maxUnexplainedErrorShare: 0.02 };

export function loadExceptions(root = process.cwd()): Record<string, Record<string, string>> {
  const p = join(root, 'tests', 'data-exceptions.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

export function runQa(
  companies: CompanyFile[],
  market: MarketFile,
  refs: Map<string, NasdaqAnnual[] | null>,
  exceptions: Record<string, Record<string, string>>,
): QaFile {
  const out: QaFile['companies'] = {};
  const refGaps: QaFile['reference'] = {};
  const gap = (a: number | null, b: number | null | undefined) => (a == null || b == null || b === 0 ? undefined : Math.round((Math.abs(a - b) / Math.abs(b)) * 1e4) / 1e4);
  const pairs = { revenue: [] as [number | null, number | null][], netIncome: [] as [number | null, number | null][], equity: [] as [number | null, number | null][] };
  let errors = 0;
  let unexplained = 0;
  let warnings = 0;
  let noRef = 0;
  for (const c of companies) {
    const t = trimCompanyfacts(c.facts);
    const h = extractHistoricals(t);
    const financial = isFinancialFirm(c.subIndustry);
    const { a } = defaultAssumptions(h, { price: c.price?.close ?? null, rf: market.rf, erp: market.erp, marketCap: c.marketCap ?? null, subIndustry: c.subIndustry });
    const issues = checkCompany(h, t, { financial, price: c.price?.close, marketCap: c.marketCap?.value, sharesUsed: a.shares ? a.shares * 1e6 : null, today: market.asOf });

    // Reference: the Nasdaq column for the same fiscal year end (within two weeks).
    const end = h.yearEnds.at(-1);
    const ref = end ? refs.get(c.ticker)?.find((r) => Math.abs(Date.parse(r.end) - Date.parse(end)) < 15 * 86_400_000) : undefined;
    if (ref) {
      issues.push(...compareReference(h, ref, financial));
      if (!financial) pairs.revenue.push([latest(h, 'revenue'), ref.revenue]);
      pairs.netIncome.push([latest(h, 'netIncome'), ref.netIncome]);
      pairs.equity.push([latest(h, 'equity'), ref.equity]);
      const g = { revenue: financial ? undefined : gap(latest(h, 'revenue'), ref.revenue), netIncome: gap(latest(h, 'netIncome'), ref.netIncome), equity: gap(latest(h, 'equity'), ref.equity) };
      refGaps[c.ticker] = Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined));
    } else noRef++;

    for (const i of issues) {
      if (i.severity === 'error') {
        errors++;
        if (!exceptions[c.ticker]?.[i.id]) unexplained++;
      } else warnings++;
    }
    if (issues.length) out[c.ticker] = issues;
  }
  const rate = (p: [number | null, number | null][]) => {
    const r = matchRate(p);
    return { compared: r.n, within2pct: r.within2, rate: r.n ? r.within2 / r.n : 1 };
  };
  return {
    asOf: market.asOf,
    summary: {
      companies: companies.length,
      errors,
      unexplainedErrors: unexplained,
      warnings,
      reference: { revenue: rate(pairs.revenue), netIncome: rate(pairs.netIncome), equity: rate(pairs.equity) },
      referenceUnavailable: noRef,
    },
    companies: out,
    reference: refGaps,
  };
}

/** Reasons to refuse publishing, or an empty list. */
export function gateFailures(qa: QaFile): string[] {
  const fails: string[] = [];
  for (const [k, r] of Object.entries(qa.summary.reference))
    if (r.compared >= GATE.minCompared && r.rate < GATE.minMatchRate)
      fails.push(`${k} matches Nasdaq within 2% for only ${(r.rate * 100).toFixed(0)}% of ${r.compared} companies (minimum ${GATE.minMatchRate * 100}%).`);
  if (qa.summary.unexplainedErrors > GATE.maxUnexplainedErrorShare * qa.summary.companies)
    fails.push(`${qa.summary.unexplainedErrors} data-check errors are not explained in tests/data-exceptions.json (limit ${Math.floor(GATE.maxUnexplainedErrorShare * qa.summary.companies)}).`);
  return fails;
}
