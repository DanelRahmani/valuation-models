/**
 * Saved scenarios in the Excel download, the banker way: a Scenarios sheet with one column per case and a dropdown
 * selector. Every input or per-year adjustment that any scenario changes reads its live value from that sheet with
 * INDEX/MATCH, so switching the dropdown recalculates the whole workbook. The file always opens on the base case.
 */
import { ADJUST_FIELDS, type AdjustField, type Assumptions, type Sources } from '../finance/assumptions';
import type { ModelId, Values, Workbook } from '../finance/calcsheet';
import { ADJUST_ROWS, N } from '../finance/models';
import { quickRun } from '../finance/run';
import type { Historicals } from '../finance/types';
import { applyScenario, neutralAdjust } from '../scenarios/apply';
import type { Scenario } from '../scenarios/types';

export interface ScenarioExport {
  /** Base-case workbook with every adjustment row any scenario uses (neutral values), so the model sheets can switch. */
  wb: Workbook;
  values: Values;
  names: string[];
  stories: string[];
  /** Inputs any scenario changes: key -> [base, ...scenario values]. */
  inputs: { key: string; label: string; fmt: Workbook['inputs'][number]['fmt']; vals: (number | null)[] }[];
  /** Adjustment rows: row key -> per year (1-10) -> [base, ...scenario values]. */
  adjust: { field: AdjustField; rowKey: string; label: string; fmt: Workbook['inputs'][number]['fmt']; years: number[][] }[];
  /** Static value per share, model x case, computed by the site. */
  summary: { id: ModelId; title: string; vals: (number | null)[] }[];
}

export function prepareScenarioExport(h: Historicals, base: Assumptions, src: Sources, scenarios: Scenario[]): ScenarioExport | null {
  if (!scenarios.length) return null;
  const applied = scenarios.map((s) => applyScenario(base, s).a);
  const fields = ADJUST_FIELDS.filter((f) => applied.some((a) => a.adjust?.[f]));
  // The workbook discounts a rate path as if the cost of debt follows it; a scenario that says otherwise is scaled to match.
  const aU: Assumptions = { ...base, adjust: fields.length ? { ...neutralAdjust(base, fields), rdFollowsRf: true } : undefined };
  const baseRun = quickRun(h, aU, src);
  const runs = applied.map((a) => quickRun(h, a, src));
  const names = ['Base case', ...scenarios.map((s, i) => uniqueName(s.name, i))];

  const inputs: ScenarioExport['inputs'] = [];
  for (const d of baseRun.wb.inputs) {
    if (typeof d.value === 'string') continue;
    const vals = [d.value, ...runs.map((r) => r.wb.inputs.find((x) => x.key === d.key)?.value)].map((x) => (typeof x === 'number' ? x : null));
    if (vals.slice(1).some((x) => x !== vals[0])) inputs.push({ key: d.key, label: d.label, fmt: d.fmt, vals });
  }

  const wDebt = baseRun.values.inputs.w_debt ?? 0;
  const tax = base.tax;
  const adjust: ScenarioExport['adjust'] = fields.map((f) => {
    const neutral = neutralAdjust(base, [f])[f]!;
    const cols = [neutral, ...applied.map((a) => {
      const arr = a.adjust?.[f] ?? neutralAdjust(a, [f])[f]!;
      if (f === 'rfAdd' && a.adjust?.rdFollowsRf === false) {
        const k = (1 - wDebt) / ((1 - wDebt) + wDebt * (1 - tax) || 1);
        return arr.map((x) => x * k);
      }
      return arr;
    })];
    return {
      field: f,
      rowKey: ADJUST_ROWS[f].key,
      label: ADJUST_ROWS[f].label,
      fmt: ADJUST_ROWS[f].fmt,
      years: Array.from({ length: N + 1 }, (_, t) => cols.map((c) => c[t] ?? 0)),
    };
  });

  const summary = baseRun.results
    .filter((r) => r.status === 'ok')
    .map((r) => ({
      id: r.id,
      title: r.sheet.title,
      vals: [r.perShare, ...runs.map((x) => {
        const y = x.results.find((z) => z.id === r.id);
        return y?.status === 'ok' ? y.perShare : null;
      })],
    }));

  return { wb: baseRun.wb, values: baseRun.values, names, stories: ['The case built from the filings', ...scenarios.map((s) => s.story)], inputs, adjust, summary };
}

/** Excel list values must be unique and free of commas for the dropdown. */
function uniqueName(n: string, i: number) {
  const clean = n.replace(/[,"]/g, ' ').trim().slice(0, 60) || `Scenario ${i + 1}`;
  return `${i + 1}. ${clean}`;
}
