import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals } from '../src/lib/finance/extract';
import { defaultAssumptions } from '../src/lib/finance/assumptions';
import { runAll } from '../src/lib/finance/run';
import { mcParams, normal, rng, simulate, summarize, tornado, triangular, type TornadoInputs } from '../src/lib/finance/uncertainty';

const setup = (t: string, subIndustry?: string) => {
  const c = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'companies', `${t}.json`), 'utf8'));
  const h = extractHistoricals(c.facts);
  const { a, src } = defaultAssumptions(h, { price: 100, rf: 0.045, erp: 0.045, subIndustry: subIndustry ?? c.subIndustry });
  const out = runAll(h, a, src);
  const I = out.values.inputs;
  const inputs: TornadoInputs = {
    wacc: I.wacc ?? null,
    re: I.re ?? null,
    beta: a.beta,
    betaSe: 0.2,
    g1: a.g1,
    gT: a.gT,
    marginTarget: a.marginTarget,
    capexPct: a.capexPct,
    nwcPct: a.nwcPct,
    tax: a.tax,
    roe: a.roe,
  };
  return { h, a, out, inputs, base: out.results.find((r) => r.id === (a.financial ? 'ri' : 'fcff'))!.perShare! };
};

describe('random draws', () => {
  it('the same seed gives the same sequence', () => {
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('normal draws have mean near 0 and sd near 1', () => {
    const u = rng(7);
    const xs = Array.from({ length: 20000 }, () => normal(u));
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
    expect(Math.abs(m)).toBeLessThan(0.03);
    expect(Math.abs(Math.sqrt(v) - 1)).toBeLessThan(0.03);
  });
  it('triangular draws stay in range', () => {
    const u = rng(3);
    for (let k = 0; k < 1000; k++) {
      const x = triangular(u, 0.015, 0.025, 0.03);
      expect(x).toBeGreaterThanOrEqual(0.015);
      expect(x).toBeLessThanOrEqual(0.03);
    }
  });
});

describe('tornado', () => {
  it('brackets the base value and puts the widest swing first (McDonald’s)', () => {
    const { out, inputs, base } = setup('MCD');
    const rows = tornado(out.wb, inputs, false);
    expect(rows.length).toBeGreaterThan(5);
    for (let k = 1; k < rows.length; k++) expect(rows[k - 1].swing).toBeGreaterThanOrEqual(rows[k].swing);
    const wacc = rows.find((r) => r.key === 'wacc')!;
    expect(Math.min(wacc.atLow!, wacc.atHigh!)).toBeLessThan(base);
    expect(Math.max(wacc.atLow!, wacc.atHigh!)).toBeGreaterThan(base);
    // A long-duration consumer business is most sensitive to the discount rate.
    expect(['wacc', 'beta_l']).toContain(rows[0].key);
  });
  it('uses residual-income inputs for banks (JPMorgan)', () => {
    const { out, inputs } = setup('JPM');
    const keys = tornado(out.wb, inputs, true).map((r) => r.key);
    expect(keys).toContain('roe');
    expect(keys).not.toContain('wacc');
  });
});

describe('Monte Carlo', () => {
  it('is reproducible for a given seed', () => {
    const { h, out, inputs } = setup('MCD');
    const p = mcParams(h, inputs, false);
    const a = simulate(out.wb, p, 200, rng(11), false);
    const b = simulate(out.wb, p, 200, rng(11), false);
    expect(a).toEqual(b);
  });
  it('with no spread every draw is the base value', () => {
    const { h, out, inputs, base } = setup('MCD');
    const p = mcParams(h, inputs, false);
    const flat = { ...p, g1: { ...p.g1, sd: 0 }, margin: p.margin && { ...p.margin, sd: 0 }, beta: { ...p.beta, sd: 0 }, gT: { lo: inputs.gT, mode: inputs.gT, hi: inputs.gT }, capex: p.capex && { ...p.capex, spread: 0 } };
    const r = simulate(out.wb, flat, 50, rng(1), false);
    expect(r.invalid).toBe(0);
    for (const v of r.values) expect(v).toBeCloseTo(base, 6);
  });
  it('centres near the base value and summarises percentiles in order', () => {
    const { h, out, inputs, base } = setup('MCD');
    const r = simulate(out.wb, mcParams(h, inputs, false), 800, rng(5), false);
    const s = summarize(r.values, 100)!;
    expect(s.p10).toBeLessThan(s.p50);
    expect(s.p50).toBeLessThan(s.p90);
    expect(Math.abs(s.p50 / base - 1)).toBeLessThan(0.35);
    expect(s.bins.reduce((n, b) => n + b.count, 0)).toBe(s.n);
    expect(s.aboveprice).toBeGreaterThanOrEqual(0);
  });
  it('counts draws that break the model instead of keeping them', () => {
    const { h, out, inputs } = setup('MCD');
    const p = mcParams(h, inputs, false);
    // Terminal growth far above any plausible discount rate: every draw is invalid.
    const broken = { ...p, gT: { lo: 0.4, mode: 0.45, hi: 0.5 } };
    const r = simulate(out.wb, broken, 30, rng(2), false);
    expect(r.values.length).toBe(0);
    expect(r.invalid).toBe(30);
  });
});
