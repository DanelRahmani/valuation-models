import { describe, expect, it } from 'vitest';
import { gateFailures, GATE, type QaFile } from '../scripts/snapshot/qa';

const qa = (rates: Partial<Record<'revenue' | 'netIncome' | 'equity', number>>, unexplainedErrors = 0): QaFile => {
  const r = (rate = 0.97) => ({ compared: 450, within2pct: Math.round(450 * rate), rate });
  return {
    asOf: '2026-11-13',
    summary: {
      companies: 500,
      errors: unexplainedErrors,
      unexplainedErrors,
      warnings: 0,
      reference: { revenue: r(rates.revenue), netIncome: r(rates.netIncome), equity: r(rates.equity) },
      referenceUnavailable: 0,
    },
    companies: {},
    reference: {},
  };
};

describe('snapshot quality gate', () => {
  it('publishes when the extraction matches the reference', () => expect(gateFailures(qa({}))).toEqual([]));
  it('blocks when revenue matching collapses (a broken revenue rule)', () => expect(gateFailures(qa({ revenue: 0.6 }))).toHaveLength(1));
  it('blocks when net income matching falls below the minimum', () => expect(gateFailures(qa({ netIncome: GATE.minMatchRate - 0.01 }))).toHaveLength(1));
  it('blocks when many companies fail the accounting checks', () => expect(gateFailures(qa({}, 25))).toHaveLength(1));
  it('tolerates a few documented filing problems', () => expect(gateFailures(qa({}, 2))).toEqual([]));
});
