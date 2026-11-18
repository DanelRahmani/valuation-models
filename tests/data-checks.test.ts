/**
 * Runs the accounting checks (src/lib/finance/checks.ts) on every company in public/data, the data the site serves.
 * Fails on any error that is not a documented filing problem in tests/data-exceptions.json, and on exceptions that
 * no longer occur. Runs in CI on every push and in the monthly snapshot before data is committed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkCompany, type CheckIssue } from '../src/lib/finance/checks';
import { extractHistoricals, trimCompanyfacts } from '../src/lib/finance/extract';
import { defaultAssumptions, isFinancialFirm } from '../src/lib/finance/assumptions';

const root = join(__dirname, '..', 'public', 'data');
const market = JSON.parse(readFileSync(join(root, 'market.json'), 'utf8'));
const exceptions: Record<string, Record<string, string>> = JSON.parse(readFileSync(join(__dirname, 'data-exceptions.json'), 'utf8'));

const results: Record<string, CheckIssue[]> = {};
for (const f of readdirSync(join(root, 'companies'))) {
  const c = JSON.parse(readFileSync(join(root, 'companies', f), 'utf8'));
  const t = trimCompanyfacts(c.facts);
  const h = extractHistoricals(t);
  const { a } = defaultAssumptions(h, { price: c.price?.close ?? null, rf: market.rf, erp: market.erp, marketCap: c.marketCap ?? null, subIndustry: c.subIndustry });
  results[c.ticker] = checkCompany(h, t, {
    financial: isFinancialFirm(c.subIndustry),
    price: c.price?.close,
    marketCap: c.marketCap?.value,
    sharesUsed: a.shares ? a.shares * 1e6 : null,
    today: market.asOf,
  });
}

describe('data checks on every company', () => {
  it('has no unexplained errors', () => {
    const unexplained = Object.entries(results).flatMap(([t, issues]) =>
      issues.filter((i) => i.severity === 'error' && !exceptions[t]?.[i.id]).map((i) => `${t} [${i.id}] ${i.message}`),
    );
    expect(unexplained).toEqual([]);
  });

  it('has no stale exceptions', () => {
    const stale = Object.entries(exceptions)
      .filter(([t]) => !t.startsWith('_'))
      .flatMap(([t, ids]) =>
        Object.keys(ids)
          .filter((id) => !ids[id].startsWith('Intermittent:') && !results[t]?.some((i) => i.id === id && i.severity === 'error'))
          .map((id) => `${t} [${id}]`),
      );
    expect(stale).toEqual([]);
  });

  it('reproduces reported EPS for at least 97% of companies that report it', () => {
    const n = Object.keys(results).length;
    const epsIssues = Object.values(results).filter((issues) => issues.some((i) => i.id === 'eps')).length;
    expect(epsIssues / n).toBeLessThan(0.03);
  });
});
