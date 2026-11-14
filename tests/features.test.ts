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
