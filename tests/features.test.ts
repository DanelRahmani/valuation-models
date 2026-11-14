import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals } from '../src/lib/finance/extract';
import { defaultAssumptions } from '../src/lib/finance/assumptions';
import { groupOf, median, peerGroup, percentile, valueCreationSeries } from '../src/lib/finance/metrics';
import { applyShare, decodeShare, encodeShare } from '../src/lib/share';

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
