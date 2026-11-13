import { inputDefs, type Assumptions, type Sources } from './assumptions';
import { evaluate, resultOf, type ModelId, type SheetDef, type Values, type Workbook } from './calcsheet';
import { latest } from './extract';
import { apvSheet, ddmSheets, fcfeSheet, fcffSheet, multiplesSheet, riFinancialSheet, riSheet, scenarioSheets } from './models';
import type { Historicals } from './types';

export interface ModelResult {
  id: ModelId;
  sheet: SheetDef;
  perShare: number | null;
  status: SheetDef['status'];
  message?: string;
}

export interface RunOutput {
  wb: Workbook;
  values: Values;
  results: ModelResult[];
  reverse: { growth: number | null; message: string };
  sensitivity: { waccs: number[]; growths: number[]; grid: (number | null)[][] } | null;
  warnings: string[];
}

export function buildWorkbook(h: Historicals, a: Assumptions, src: Sources): Workbook {
  const baseYear = h.years.at(-1) ?? new Date().getFullYear();
  const da0 = latest(h, 'da');
  const ebitda0 = a.rev0 != null && a.margin0 != null ? a.rev0 * a.margin0 + (da0 ?? 0) / 1e6 : null;
  const sheets: SheetDef[] = [
    fcffSheet(a, baseYear, { id: 'fcff', name: 'FCFF', title: 'Discounted free cash flow to the firm', g1: 'g_stage1', margin: 'margin_target', capex: 'capex_pct', shares: 'shares' }),
    fcfeSheet(baseYear),
    apvSheet(baseYear),
    a.financial ? riFinancialSheet(baseYear) : riSheet(baseYear),
    ...ddmSheets(),
    multiplesSheet(a, ebitda0),
  ];
  if (a.aiMode) sheets.push(...scenarioSheets(a, baseYear));
  return { inputs: inputDefs(a, src, h), sheets };
}

/** Set model statuses from the evaluated inputs: things the formulas alone cannot judge. */
function judge(wb: Workbook, v: Values, a: Assumptions): string[] {
  const i = v.inputs;
  const warnings: string[] = [];
  const set = (id: ModelId, status: SheetDef['status'], message: string) => {
    const s = wb.sheets.find((x) => x.id === id);
    if (s && s.status === 'ok') Object.assign(s, { status, message });
  };
  const needs = (keys: string[], ids: ModelId[]) => {
    const miss = keys.filter((k) => i[k] == null);
    if (miss.length) for (const id of ids) set(id, 'needs-input', `Needs: ${miss.map((k) => wb.inputs.find((d) => d.key === k)?.label ?? k).join(', ')}`);
  };
  const dcfIds: ModelId[] = ['fcff', 'fcfe', 'apv', 'ri', 'fcff_bear', 'fcff_base', 'fcff_bull', 'scenarios'];
  needs(['price', 'shares'], [...dcfIds, 'ddm_gordon', 'ddm_2stage', 'ddm_h', 'multiples']);
  if (a.financial) {
    const msg = 'Banks and insurers borrow to fund operations, so debt is raw material, not financing: enterprise-value models do not apply. Use residual income, dividends, P/E and P/B.';
    for (const id of ['fcff', 'fcfe', 'apv', 'fcff_bear', 'fcff_base', 'fcff_bull', 'scenarios'] as ModelId[]) set(id, 'na', msg);
    needs(['equity_0', 'roe'], ['ri']);
  } else {
    needs(['rev_0', 'margin_0'], dcfIds);
    needs(['equity_0'], ['ri']);
  }

  const gT = i.g_terminal ?? 0;
  if (gT > (i.rf ?? 0)) warnings.push('Terminal growth is above the risk-free rate. Over the long run, no company outgrows the economy.');
  const guard = (rate: string, ids: ModelId[]) => {
    const r = i[rate];
    if (r != null && r <= gT) for (const id of ids) set(id, 'na', `The discount rate (${(r * 100).toFixed(1)}%) must exceed terminal growth.`);
  };
  guard('wacc', ['fcff', 'fcff_bear', 'fcff_base', 'fcff_bull', 'scenarios']);
  guard('re', ['fcfe', 'ri', 'ddm_gordon', 'ddm_2stage', 'ddm_h']);
  guard('ru', ['apv']);

  if (!(a.dps0 && a.dps0 > 0)) for (const id of ['ddm_gordon', 'ddm_2stage', 'ddm_h'] as ModelId[]) set(id, 'na', 'The company pays no dividend, so dividend models do not apply.');
  if (a.aiMode) {
    const p = (i.prob_bear ?? 0) + (i.prob_base ?? 0) + (i.prob_bull ?? 0);
    if (Math.abs(p - 1) > 0.001) set('scenarios', 'needs-input', `Probabilities add up to ${(p * 100).toFixed(0)}%, not 100%.`);
  }

  const w = i.wacc;
  if (!a.financial && w != null && w - gT < 0.03 && w > gT)
    warnings.push(`WACC (${(w * 100).toFixed(1)}%) is within 3 points of terminal growth, so the terminal value multiplies cash flow by more than 30. Small input changes move the answer a lot.`);
  const nd = i.net_debt;
  const mc = i.mcap;
  if (!a.financial && nd != null && mc != null && mc > 0 && nd > 2 * mc)
    warnings.push(`Net debt is ${(nd / mc).toFixed(1)}× the market value of equity. Equity is a thin slice of the firm, so a small change in enterprise value is a large change per share.`);

  const fcff = wb.sheets.find((s) => s.id === 'fcff')!;
  const tvShare = v.sheets.FCFF.tv_share?.[0];
  if (fcff.status === 'ok' && tvShare != null && tvShare > 0.85)
    warnings.push(`The terminal value is ${(tvShare * 100).toFixed(0)}% of FCFF enterprise value, so the result rests mostly on what happens after year 10.`);
  return warnings;
}

/** Solve for the stage-1 growth that makes the FCFF value equal the share price (bisection). */
function reverseDcf(wb: Workbook, price: number | null): RunOutput['reverse'] {
  if (price == null) return { growth: null, message: 'Enter a share price to run the reverse DCF.' };
  const f = (g: number) => evaluate(wb, { g_stage1: g }).sheets.FCFF.per_share[0];
  let lo = -0.5;
  let hi = 1.0;
  const flo = f(lo);
  const fhi = f(hi);
  if (flo == null || fhi == null) return { growth: null, message: 'The reverse DCF needs a complete FCFF model.' };
  if ((flo - price) * (fhi - price) > 0)
    return { growth: null, message: 'No growth rate between -50% and +100% a year matches the current price under these assumptions.' };
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid)!;
    if ((flo - price) * (fm - price) <= 0) hi = mid;
    else lo = mid;
  }
  const g = (lo + hi) / 2;
  return { growth: g, message: '' };
}

function sensitivity(wb: Workbook, v: Values): RunOutput['sensitivity'] {
  const w = v.inputs.wacc;
  const g = v.inputs.g_terminal;
  if (w == null || g == null) return null;
  const waccs = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => w + d);
  const growths = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => g + d);
  const grid = waccs.map((ww) => growths.map((gg) => (ww <= gg ? null : evaluate(wb, { wacc: ww, g_terminal: gg }).sheets.FCFF.per_share[0])));
  return { waccs, growths, grid };
}

export function runAll(h: Historicals, a: Assumptions, src: Sources): RunOutput {
  const wb = buildWorkbook(h, a, src);
  const values = evaluate(wb);
  const warnings = judge(wb, values, a);
  const fyEnd = h.yearEnds.at(-1);
  if (fyEnd && (Date.now() - Date.parse(fyEnd)) / 86_400_000 > 16 * 30)
    warnings.push(
      `The latest annual filing in SEC data is for the fiscal year ending ${fyEnd}. A merger or new reporting entity may be the reason; check the newest 10-K before relying on these figures.`,
    );
  if (a.oneOff && a.marginTarget === a.oneOff.adjusted)
    warnings.push(
      `FY${a.oneOff.year} operating income includes $${a.oneOff.charges.toFixed(0)}M of impairments, which are non-cash and one-off. The forecast uses the ${(a.oneOff.adjusted * 100).toFixed(1)}% margin before them instead of the reported ${(a.oneOff.latest * 100).toFixed(1)}%. Set the target margin to ${(a.oneOff.latest * 100).toFixed(1)}% to use the reported figure.`,
    );
  const interest = latest(h, 'interestExpense');
  // Debt found but far below what the interest bill implies (segment-tagged debt at Deere or Caterpillar's finance arms).
  if (a.debt > 0 && interest != null && interest / 1e6 / (a.rf + 0.03) > 2 * a.debt)
    warnings.push(
      `Interest expense of $${(interest / 1e6).toFixed(0)}M suggests more debt than the $${a.debt.toFixed(0)}M found in the SEC data, which may miss debt reported by segment (a finance arm, for example). Check the 10-K balance sheet.`,
    );
  if (!a.debt && interest != null && a.rev0 && interest / 1e6 > 0.002 * a.rev0)
    warnings.push(
      `No debt was found in the SEC data, yet the company paid $${(interest / 1e6).toFixed(0)}M of interest. Enter total debt from the 10-K balance sheet before trusting the equity value.`,
    );
  const results: ModelResult[] = wb.sheets
    .filter((s) => !s.id.startsWith('fcff_'))
    .map((s) => ({ id: s.id, sheet: s, perShare: resultOf(wb, values, s.id), status: s.status, message: s.message }));
  const fcffOk = wb.sheets.find((s) => s.id === 'fcff')!.status === 'ok';
  return {
    wb,
    values,
    results,
    reverse: fcffOk
      ? reverseDcf(wb, values.inputs.price)
      : { growth: null, message: a.financial ? 'Banks and insurers are valued on equity, so there is no free-cash-flow reverse DCF. See residual income and P/B.' : 'The reverse DCF needs a working FCFF model.' },
    sensitivity: fcffOk && a.terminalMethod === 'gordon' ? sensitivity(wb, values) : null,
    warnings,
  };
}
