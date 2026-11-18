import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { companyDefaults } from '../src/lib/valuate';
import { quickRun } from '../src/lib/finance/run';
import { ADJUST_FIELDS } from '../src/lib/finance/assumptions';
import { applyScenario, neutralAdjust } from '../src/lib/scenarios/apply';

const dir = join(__dirname, 'fixtures', 'companies');
const load = (f: string) => companyDefaults(JSON.parse(readFileSync(join(dir, f), 'utf8')), null);

describe('scenarios', () => {
  it('neutral adjustment rows leave every model value unchanged', () => {
    for (const f of readdirSync(dir)) {
      const d = load(f);
      const base = quickRun(d.h, d.a, d.src).results;
      const a = { ...d.a, adjust: { ...neutralAdjust(d.a, [...ADJUST_FIELDS]), rdFollowsRf: true } };
      const adj = quickRun(d.h, a, d.src).results;
      for (const r of base) {
        const x = adj.find((y) => y.id === r.id)!;
        expect([f, r.id, x.status]).toEqual([f, r.id, r.status]);
        if (r.perShare == null) expect(x.perShare).toBeNull();
        else expect(x.perShare).toBeCloseTo(r.perShare, 2);
      }
    }
  });

  it('compiles a new-entrant shock and relative margin change onto the base forecast', () => {
    const d = load('AMD.json');
    const base = quickRun(d.h, d.a, d.src).values.sheets.FCFF;
    const { a } = applyScenario(d.a, {
      changes: [
        { lever: 'shockYear', op: 'set', value: 3 },
        { lever: 'shockRevLoss', op: 'set', value: 0.2 },
        { lever: 'shockMarginDrop', op: 'set', value: 0.1 },
        { lever: 'marginTarget', op: 'add', value: -0.05 },
      ],
    });
    expect(a.marginTarget).toBeCloseTo(d.a.marginTarget! - 0.05, 10);
    const s = quickRun(d.h, a, d.src).values.sheets.FCFF;
    // Years 1-2 grow as before; year 3 loses 20% of its revenue level.
    expect(s.revenue[2]).toBeCloseTo(base.revenue[2]!, 4);
    expect(s.revenue[3]).toBeCloseTo(base.revenue[3]! * 0.8, 4);
    // The margin hit lands in year 3 on top of the lower target path, and is permanent (no recovery set).
    const path = (t: number) => d.a.margin0! + (a.marginTarget! - d.a.margin0!) * Math.min(t / a.marginYears, 1);
    expect(s.margin[2]).toBeCloseTo(path(2), 8);
    expect(s.margin[3]).toBeCloseTo(path(3) - 0.1, 8);
    expect(s.margin[10]).toBeCloseTo(path(10) - 0.1, 8);
  });
});
