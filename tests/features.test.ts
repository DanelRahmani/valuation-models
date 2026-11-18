import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals } from '../src/lib/finance/extract';
import { defaultAssumptions } from '../src/lib/finance/assumptions';
import { groupOf, median, peerGroup, percentile, valueCreationSeries } from '../src/lib/finance/metrics';
import { applyShare, decodeShare, encodeShare } from '../src/lib/share';
import { runAll } from '../src/lib/finance/run';

const fixture = (t: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'companies', `${t}.json`), 'utf8'));

describe('peer groups', () => {
  const row = (ticker: string, subIndustry: string, sector = 'X', name = ticker) => ({ ticker, name, sector, subIndustry });
  const all = [
    row('F', 'Automobile Manufacturers', 'Consumer Discretionary'),
    row('GM', 'Automobile Manufacturers', 'Consumer Discretionary'),
    row('TSLA', 'Automobile Manufacturers', 'Consumer Discretionary'),
    row('APTV', 'Automotive Parts & Equipment', 'Consumer Discretionary'),
    row('HAS', 'Leisure Products', 'Consumer Discretionary'),
    row('GOOG', 'Interactive Media & Services', 'Communication Services', 'Alphabet Inc. (Class C)'),
    row('GOOGL', 'Interactive Media & Services', 'Communication Services', 'Alphabet Inc. (Class A)'),
    row('META', 'Interactive Media & Services', 'Communication Services'),
  ];
  it('merges small related sub-industries (automakers with parts makers)', () => {
    const g = peerGroup('F', all)!;
    expect(g.basis).toBe('sub-industry');
    expect(g.name).toBe('Automakers and parts');
    expect(g.members.sort()).toEqual(['APTV', 'F', 'GM', 'TSLA']);
  });
  it('falls back to the sector when the group is too small', () => expect(peerGroup('HAS', all)!.basis).toBe('sector'));
  it('counts two share classes of one company once, keeping the one asked for', () => {
    const g = peerGroup('GOOGL', all)!;
    expect(g.members.filter((t) => t.startsWith('GOOG'))).toEqual(['GOOGL']);
  });
  it('folds REIT sub-industries together', () => expect(groupOf('Self-Storage REITs')).toBe('REITs'));
});

describe('statistics', () => {
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('percentile ranks against peers', () => {
    expect(percentile(5, [1, 2, 3, 4])).toBe(1);
    expect(percentile(0, [1, 2, 3, 4])).toBe(0);
    expect(percentile(2, [1, 2, 3])).toBeCloseTo(0.5);
    expect(percentile(null, [1])).toBeNull();
  });
});

describe('value creation', () => {
  it('computes after-tax ROIC on invested capital (AMD)', () => {
    const h = extractHistoricals(fixture('AMD').facts);
    const last = valueCreationSeries(h, 0.21).at(-1)!;
    // EBIT 3,694 x (1 - 21%) / (equity 62,999 + debt 3,250 - cash 5,539 - investments 5,013) = about 5.2%
    expect(last.roic).toBeCloseTo((3694 * 0.79) / (62999 + 3250 - 5539 - 5013), 2);
    expect(last.capex).toBeCloseTo(974e6, -6);
  });
  it('uses return on equity for banks', () => {
    const h = extractHistoricals(fixture('JPM').facts);
    const last = valueCreationSeries(h, 0.21, true).at(-1)!;
    expect(last.roic).toBeGreaterThan(0.1);
    expect(last.leverage).toBeNull();
  });
});

describe('return on capital that is not meaningful', () => {
  it('flags Palantir, whose cash almost equals its book equity, and falls back to return on equity', () => {
    const h = extractHistoricals(fixture('PLTR').facts);
    const last = valueCreationSeries(h, 0.21).at(-1)!;
    expect(last.roicNm).toBe(true);
    expect(last.roic).toBeNull();
    expect(last.roe).toBeGreaterThan(0.1);
  });
  it('keeps a normal ROIC for a company with real invested capital (AMD)', () => {
    const last = valueCreationSeries(extractHistoricals(fixture('AMD').facts), 0.21).at(-1)!;
    expect(last.roicNm).toBe(false);
    expect(last.roic).toBeGreaterThan(0);
  });
});

describe('multiples for a loss-making company (Intel)', () => {
  const h = extractHistoricals(fixture('INTC').facts);
  const { a, src } = defaultAssumptions(h, { price: 61.2, rf: 0.051, erp: 0.042 });
  // Semiconductor averages: P/E 49x, EV/EBITDA 35x, EV/Sales 15.7x at a 35% margin, P/B 13x at a 30% ROE.
  a.peers = { pe: 48.8, evEbitda: 34.8, evSales: 15.7, pb: 13.3, peg: 2.1, margin: 0.353, roe: 0.3 };
  const out = runAll(h, a, src);
  const v = out.values.sheets.Multiples;
  it('skips EV/Sales when the operating margin is negative', () => expect(v.ev_sales[2]).toBeNull());
  it('skips P/B when the return on equity is negative', () => expect(v.pb[2]).toBeNull());
  it('says when the value rests on one multiple', () => {
    const r = out.results.find((x) => x.id === 'multiples')!;
    const used = ['pe', 'ev_ebitda', 'ev_sales', 'pb', 'peg'].filter((k) => v[k]?.[2] != null);
    if (used.length === 1) expect(r.sheet.message).toMatch(/one multiple only/);
  });
});

describe('margin-adjusted EV/Sales', () => {
  it('scales the peer multiple by margin, at most 1.5x up', () => {
    const h = extractHistoricals(fixture('MCD').facts);
    const { a, src } = defaultAssumptions(h, { price: 300, rf: 0.045, erp: 0.045 });
    a.peers = { pe: 25, evEbitda: 15, evSales: 4, pb: 5, peg: 2, margin: 0.1, roe: 0.2 };
    const v = runAll(h, a, src).values.sheets.Multiples;
    // McDonald's margin is about 45%, far above the 10% peer margin, so the multiple is capped at 1.5 x 4.
    expect(v.ev_sales[1]).toBeCloseTo(6, 6);
  });
});

describe('shareable links', () => {
  const h = extractHistoricals(fixture('MCD').facts);
  const { a: defaults } = defaultAssumptions(h, { price: 300, rf: 0.045, erp: 0.045 });
  it('encodes only what changed, and round-trips', () => {
    const a = { ...defaults, g1: 0.07, marginTarget: 0.35, terminalMethod: 'exit' as const };
    const q = encodeShare({ ticker: 'MCD', beta: 'regression', defaultBeta: 'industry', simple: true, a, defaults });
    expect(q).toContain('t=MCD');
    expect(q).toContain('beta=regression');
    expect(q).toContain('view=simple');
    expect(q).not.toContain('rf=');
    const back = decodeShare(q);
    const restored = applyShare(defaults, back);
    expect(back.ticker).toBe('MCD');
    expect(back.beta).toBe('regression');
    expect(back.simple).toBe(true);
    expect(restored.g1).toBeCloseTo(0.07);
    expect(restored.marginTarget).toBeCloseTo(0.35);
    expect(restored.terminalMethod).toBe('exit');
    expect(restored.rf).toBe(defaults.rf);
  });
  it('a typed beta implies the manual method', () => {
    const s = decodeShare('t=MCD&b=1.2');
    expect(s.beta).toBe('manual');
    expect(applyShare(defaults, s).beta).toBe(1.2);
  });
  it('ignores junk', () => {
    const s = decodeShare('t=mcd&beta=lucky&g1=abc');
    expect(s.ticker).toBe('MCD');
    expect(s.beta).toBeUndefined();
    expect(s.over.g1).toBeUndefined();
  });
});

describe('trailing twelve months', () => {
  // Palantir as filed (docs/ttm-plan.md), in $M: FY2025 10-K plus the 10-Q for the nine months to 30 Sep 2026.
  // TTM revenue = 4,475 + 5,881 - 3,069 = 7,287 (Nasdaq's sum of four quarters: 7,288).
  const M = 1e6;
  const flow = (start: string, end: string, val: number, form: string, filed: string) => ({ start, end, val: val * M, form, filed });
  const inst = (end: string, val: number, form: string, filed: string) => ({ end, val: val * M, form, filed });
  const raw = {
    cik: 1321655,
    entityName: 'Palantir Technologies Inc.',
    facts: {
      'us-gaap': {
        Revenues: {
          units: {
            USD: [
              flow('2024-01-01', '2024-12-31', 2865, '10-K', '2025-02-18'),
              flow('2025-01-01', '2025-12-31', 4475, '10-K', '2026-02-17'),
              flow('2024-01-01', '2024-09-30', 2047, '10-Q', '2024-11-04'),
              flow('2025-01-01', '2025-09-30', 3069, '10-Q', '2025-11-04'),
              flow('2025-07-01', '2025-09-30', 1181, '10-Q', '2025-11-04'), // the quarter alone: not year to date, dropped
              flow('2026-01-01', '2026-09-30', 5881, '10-Q', '2026-11-03'),
            ],
          },
        },
        NetIncomeLoss: {
          units: {
            USD: [
              flow('2024-01-01', '2024-12-31', 462, '10-K', '2025-02-18'),
              flow('2025-01-01', '2025-12-31', 1625, '10-K', '2026-02-17'),
              flow('2025-01-01', '2025-09-30', 1100, '10-Q', '2025-11-04'),
              flow('2026-01-01', '2026-09-30', 3145, '10-Q', '2026-11-03'),
            ],
          },
        },
        StockholdersEquity: { units: { USD: [inst('2025-12-31', 7400, '10-K', '2026-02-17'), inst('2026-09-30', 9800, '10-Q', '2026-11-03')] } },
      },
    },
  };

  it('rolls the 10-K forward with 10-Q year-to-date figures and starts the forecast there', () => {
    const h = extractHistoricals(raw);
    expect(h.years.at(-1)).toBe(2025);
    expect(h.ttm?.end).toBe('2026-09-30');
    expect(h.ttm!.items.revenue!.value / M).toBeCloseTo(7287, 6);
    expect(h.ttm!.items.netIncome!.value / M).toBeCloseTo(1625 + 3145 - 1100, 6);
    expect(h.ttm!.items.equity!.value / M).toBe(9800); // balance sheet from the 10-Q, no arithmetic
    expect(h.ttm!.prior!.revenue!.value / M).toBeCloseTo(2865 + 3069 - 2047, 6); // the same window a year earlier

    const ttm = defaultAssumptions(h, { price: 170, rf: 0.042, erp: 0.045 }).a;
    expect(ttm.basis).toBe('ttm');
    expect(ttm.rev0).toBeCloseTo(7287, 6);
    expect(ttm.equity0).toBe(9800);
    expect(ttm.g1).toBeCloseTo(7287 / 3887 - 1, 6); // growth: last 12 months against the 12 months a year earlier
    expect(runAll(h, ttm, {}).wb.sheets[0].columns.slice(0, 2)).toEqual(['TTM', 'Yr 1']);

    const fy = defaultAssumptions(h, { price: 170, rf: 0.042, erp: 0.045 }, 'fy').a;
    expect(fy.basis).toBe('fy');
    expect(fy.rev0).toBeCloseTo(4475, 6);
    expect(fy.g1).toBeCloseTo(4475 / 2865 - 1, 6);
  });
});
