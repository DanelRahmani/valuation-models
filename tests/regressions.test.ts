/**
 * Regression tests: each case is a company whose filing broke an earlier version of the extraction. The facts are
 * frozen copies (tests/fixtures/companies), so these never change with the monthly data. Expected values are the
 * 10-K figures, cross-checked against Nasdaq's statements where the definitions match.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals } from '../src/lib/finance/extract';
import { checkCompany } from '../src/lib/finance/checks';
import type { LineItem } from '../src/lib/finance/types';

const load = (t: string) => {
  const c = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'companies', `${t}.json`), 'utf8'));
  return { h: extractHistoricals(c.facts), facts: c.facts };
};
/** Latest-year value in $ millions (or millions of shares). */
const m = (t: string, item: LineItem) => {
  const v = load(t).h.items[item]?.at(-1);
  return v ? v.value / 1e6 : null;
};
const near = (actual: number | null, expected: number, tol = 0.01) => {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected) / Math.abs(expected)).toBeLessThanOrEqual(tol);
};

describe('D&A', () => {
  it('adds intangible amortization when only depreciation is tagged (AMD: 521 + 2,300)', () => near(m('AMD', 'da'), 2821));
  it('takes the full cash-flow D&A, not a narrower tag listed first (Salesforce 3,631, not 1,200)', () => near(m('CRM', 'da'), 3631));
  it('adds amortization when the combined tag is smaller than amortization alone (Cisco 700 + 916)', () => near(m('CSCO', 'da'), 1616));
  it('matches the 10-K exactly when D&A is tagged once (Booking 623)', () => near(m('BKNG', 'da'), 623, 0.001));
});

describe('total debt', () => {
  it('counts a line tagged twice only once (AMD: 874 current + 2,348 long-term, about 3.2B)', () => near(m('AMD', 'debt'), 3222, 0.02));
  it('treats a long-term tag that includes current maturities as the total (Chevron 40.8B, not 50.7B)', () => near(m('CVX', 'debt'), 40758));
  it('finds debt spread across many tags (Oracle about 130B, not 7B)', () => near(m('ORCL', 'debt'), 130105, 0.02));
});

describe('operating income', () => {
  it('rebuilds it when no subtotal is reported (J&J 25,287, equal to Nasdaq)', () => near(m('JNJ', 'operatingIncome'), 25287));
  it('never borrows an older year: Phillips 66 uses domestic + foreign pre-tax income for the latest year', () => {
    const v = load('PSX').h.items.operatingIncome?.at(-1);
    expect(v?.end).toBe('2025-12-31');
    expect(v!.value).toBeGreaterThan(0);
  });
});

describe('revenue', () => {
  it('uses rent when contract revenue is only a sliver (Camden 1,574, not 13)', () => near(m('CPT', 'revenue'), 1574));
});

describe('net income', () => {
  it('excludes minority interests (Freeport-McMoRan 2,204, not 4,152)', () => near(m('FCX', 'netIncome'), 2204));
  it('uses income to common after preferred dividends (Microchip 119, not 230)', () => near(m('MCHP', 'netIncome'), 119));
  it('ignores a mis-scaled income-to-common tag when it contradicts reported EPS (Packaging Corp 769)', () => near(m('PKG', 'netIncome'), 769));
});

describe('shares', () => {
  it('rescales diluted shares filed in millions (McDonald\'s 716M, not 716)', () => near(m('MCD', 'dilutedShares'), 716));
  it('rescales a cover-page count filed in thousands (Packaging Corp about 90M)', () => {
    const { h } = load('PKG');
    near(h.latestShares!.value / 1e6, 89, 0.03);
  });
  it('takes the latest 10-Q cover count, so later splits count (Booking 25:1, Amphenol 2:1)', () => {
    expect(load('BKNG').h.latestShares!.value / 1e6).toBeGreaterThan(700);
    expect(load('APH').h.latestShares!.value / 1e6).toBeGreaterThan(2400);
  });
});

describe('capex and impairments', () => {
  it('adds oil and gas development spending (Diamondback 3,523)', () => near(m('FANG', 'capex'), 3523));
  it('does not double count when "productive assets" is already the total (Chevron 17.3B, not 34.2B)', () => near(m('CVX', 'capex'), 17347));
  it('finds impairments for the one-off add-back (Kraft Heinz 9,306)', () => near(m('KHC', 'impairments'), 9306));
});

describe('data checks pass on every regression case', () => {
  for (const t of ['AMD', 'CVX', 'CRM', 'CSCO', 'BKNG', 'JNJ', 'CPT', 'FCX', 'PSX', 'MCD', 'PKG', 'MCHP', 'APH', 'ORCL', 'FANG', 'KHC']) {
    it(t, () => {
      const { h, facts } = load(t);
      const errors = checkCompany(h, facts, { today: '2026-11-13' }).filter((i) => i.severity === 'error');
      expect(errors).toEqual([]);
    });
  }
});
