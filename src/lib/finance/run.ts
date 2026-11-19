import { inputDefs, type Assumptions, type Sources } from './assumptions';
import { evaluate, resultOf, type ModelId, type SheetDef, type Values, type Workbook } from './calcsheet';
import { current } from './extract';
import { type Base, apvSheet, ddmSheets, totalPayoutSheet, fcfeSheet, fcffSheet, multiplesSheet, riFinancialSheet, riSheet, scenarioSheets } from './models';
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
  /** Reverse DCF. growth: average revenue growth over years 1-5 that makes FCFF equal the price, on the model's own
   * fading path; modelGrowth: the same average under the current assumptions, for comparison. */
  reverse: { growth: number | null; modelGrowth: number | null; message: string };
  sensitivity: { waccs: number[]; growths: number[]; grid: (number | null)[][] } | null;
  warnings: string[];
}

export function buildWorkbook(h: Historicals, a: Assumptions, src: Sources): Workbook {
  const baseYear: Base = a.basis === 'ttm' && h.ttm ? 'ttm' : (h.years.at(-1) ?? new Date().getFullYear());
  const da0 = current(h, 'da', a.basis);
  const ebitda0 = a.rev0 != null && a.margin0 != null ? a.rev0 * a.margin0 + (da0 ?? 0) / 1e6 : null;
  const rp = !!a.adjust?.rfAdd;
  const sheets: SheetDef[] = [
    fcffSheet(a, baseYear, { id: 'fcff', name: 'FCFF', title: 'Discounted free cash flow to the firm', g1: 'g_stage1', margin: 'margin_target', capex: 'capex_pct', shares: 'shares' }),
    fcfeSheet(baseYear, rp),
    apvSheet(baseYear, rp),
    a.financial ? riFinancialSheet(baseYear, rp) : riSheet(baseYear, rp),
    ...ddmSheets(),
    totalPayoutSheet(),
    multiplesSheet(a, ebitda0),
  ];
  if (a.aiMode) sheets.push(...scenarioSheets(a, baseYear));
  return { inputs: inputDefs(a, src, h), sheets };
}

/** Below this share of earnings paid out, dividends say little about value and the dividend models are skipped. */
export const MIN_DDM_PAYOUT = 0.2;
/** Below this dividend yield the price rests on growth, not on the dividend, and the dividend models are skipped. */
export const MIN_DDM_YIELD = 0.01;

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
  needs(['price', 'shares'], [...dcfIds, 'ddm_gordon', 'ddm_2stage', 'ddm_h', 'total_payout', 'multiples']);
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
  guard('re', ['fcfe', 'ri', 'ddm_gordon', 'ddm_2stage', 'ddm_h', 'total_payout']);
  guard('ru', ['apv']);

  const ddmIds = ['ddm_gordon', 'ddm_2stage', 'ddm_h'] as ModelId[];
  if (!(a.dps0 && a.dps0 > 0)) for (const id of ddmIds) set(id, 'na', 'The company pays no dividend, so dividend models do not apply.');
  else if (i.price != null && i.price > 0 && a.dps0 / i.price < MIN_DDM_YIELD)
    for (const id of ddmIds)
      set(
        id,
        'na',
        `The dividend yield is only ${((a.dps0 / i.price) * 100).toFixed(1)}%: investors are paying for growth the dividend does not show yet, so a dividend model would value the payout, not the business.${
          (a.totalPayout ?? 0) >= MIN_DDM_PAYOUT ? ' The total payout model counts buybacks too.' : ''
        }`,
      );
  else if (a.payout < MIN_DDM_PAYOUT)
    for (const id of ddmIds)
      set(
        id,
        'na',
        `Dividends are only ${(a.payout * 100).toFixed(0)}% of earnings, so a dividend model would value the token payout, not the business.${
          (a.totalPayout ?? 0) >= MIN_DDM_PAYOUT ? ' The total payout model counts buybacks too.' : ''
        }`,
      );
  if (a.totalPayout == null) set('total_payout', 'na', 'Net income over the last three years is not positive, so there are no earnings to pay out.');
  else if (a.totalPayout < MIN_DDM_PAYOUT)
    set(
      'total_payout',
      'na',
      `The company returns only ${(a.totalPayout * 100).toFixed(0)}% of earnings to shareholders (dividends plus buybacks, net of stock pay). It reinvests the rest, so payouts say little about its value.`,
    );
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

  if (a.capexMissing && !a.financial)
    warnings.push(
      'Capital spending is not tagged in this company’s SEC data, so it is assumed equal to depreciation. Utilities, REITs and other growing asset-heavy firms usually spend more; enter capex from the 10-K cash flow statement for a sharper answer.',
    );
  // Shares carry limited liability: a model that values the equity below zero has found that the cash flows do not cover
  // the claims ahead of shareholders, not a negative share price.
  for (const id of ['fcff', 'fcfe', 'apv', 'ri', 'total_payout'] as ModelId[]) {
    const ps = resultOf(wb, v, id);
    if (ps != null && ps < 0)
      set(
        id,
        'na',
        `This model comes out at minus $${Math.abs(ps).toFixed(2)} a share: on these assumptions the cash flows do not cover what is owed ahead of shareholders. A share cannot be worth less than zero, so the result is set aside; the margin and growth assumptions decide whether that is fair.`,
      );
  }

  // Residual income and FCFE are the same model up to year 10 (clean surplus) and differ only in the terminal value:
  // FCFE grows the year-10 cash flow, residual income grows book equity, which needs g × book of retained earnings a
  // year. When the forecast's own reinvestment is far below that (capex near D&A at asset-heavy firms), the two part.
  const riGap = riFcfeGap(wb, v);
  if (riGap) set('ri', 'ok', riGap);

  // Without a growth cap, a company whose revenue jumped (boom, acquisition, spin-off) gets a very large DCF value. Say so.
  const rev5 = v.sheets.FCFF?.revenue?.[5];
  if (!a.financial && a.g1 > 0.5 && rev5 != null && a.rev0 && a.rev0 > 0)
    warnings.push(
      `Revenue grew ${(a.g1 * 100).toFixed(0)}% ${a.basis === 'ttm' ? 'over the last 12 months' : 'in the latest year'} (a boom, an acquisition or a spin-off). The forecast fades that growth but still multiplies revenue ${(rev5 / a.rev0).toFixed(1)}× in five years. Check that the growth is organic and repeatable before trusting the DCF values.`,
    );
  const fcffPs = resultOf(wb, v, 'fcff');
  const px = i.price;
  if (!a.financial && fcffPs != null && fcffPs > 0 && px != null && px > 0 && (fcffPs / px > 4 || fcffPs / px < 0.25))
    warnings.push(
      `The FCFF value is ${(fcffPs / px).toFixed(1)}× the share price. When a model and the market are this far apart, an input (growth, margin, debt, share count) is usually off or the market is pricing something the history does not show; treat the gap as a prompt to check, not as a price target.`,
    );

  const fcff = wb.sheets.find((s) => s.id === 'fcff')!;
  const tvShare = v.sheets.FCFF.tv_share?.[0];
  if (fcff.status === 'ok' && tvShare != null && tvShare > 0.85)
    warnings.push(`The terminal value is ${(tvShare * 100).toFixed(0)}% of FCFF enterprise value, so the result rests mostly on what happens after year 10.`);
  return warnings;
}

/** Above this lead over the industry operating margin, the page notes that the forecast holds the margin for ever. */
export const MARGIN_GAP_NOTE = 0.15;

/** Above this gap between residual income and FCFE, the residual-income card explains where the difference comes from. */
export const RI_GAP_NOTE = 0.1;

/** Explain a large residual income vs FCFE gap, which comes only from the terminal value (see judge). */
function riFcfeGap(wb: Workbook, v: Values): string | null {
  const ri = resultOf(wb, v, 'ri');
  const fcfe = resultOf(wb, v, 'fcfe');
  if (wb.sheets.find((s) => s.id === 'ri')?.title !== 'Residual income' || ri == null || fcfe == null || fcfe <= 0) return null;
  const gap = ri / fcfe - 1;
  if (Math.abs(gap) <= RI_GAP_NOTE) return null;
  const F = v.sheets.FCFE;
  const R = v.sheets.ResidualIncome;
  const n = F.ni.length - 1;
  const g = v.inputs.g_terminal ?? 0;
  const reinvest = (F.ni[n] ?? 0) - (F.fcfe[n] ?? 0);
  const book = R.book[n] ?? 0;
  const usd = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
  return `Residual income is ${Math.abs(gap * 100).toFixed(0)}% ${gap < 0 ? 'below' : 'above'} FCFE. Up to year 10 the two are the same model; the gap is all in the terminal value. FCFE grows the year-10 cash flow at ${(g * 100).toFixed(1)}% while the company retains ${usd(reinvest)} a year, whereas residual income grows book equity at ${(g * 100).toFixed(1)}%, which takes about ${usd(g * book)} of retained earnings a year. ${
    reinvest < g * book
      ? 'FCFE assumes growth with little net investment (capex close to depreciation); residual income makes the company pay for it. For asset-heavy firms the lower value is usually the more realistic one.'
      : 'Residual income assumes book equity can grow without the reinvestment the forecast makes; FCFE charges for it.'
  }`;
}

/** Average revenue growth over years 1-5 of an evaluated FCFF sheet. */
export const avgGrowth5 = (v: Values): number | null => {
  const g = v.sheets.FCFF?.growth;
  if (!g) return null;
  const xs = [1, 2, 3, 4, 5].map((t) => g[t]).filter((x): x is number => x != null && Number.isFinite(x));
  return xs.length === 5 ? xs.reduce((s, x) => s + x, 0) / 5 : null;
};

function reverseDcf(wb: Workbook, price: number | null, values: Values): RunOutput['reverse'] {
  const modelGrowth = avgGrowth5(values);
  const r = solveReverse(wb, price);
  return { ...r, modelGrowth };
}

function solveReverse(wb: Workbook, price: number | null): { growth: number | null; message: string } {
  if (price == null) return { growth: null, message: 'Enter a share price to run the reverse DCF.' };
  const f = (g: number) => evaluate(wb, { g_stage1: g }).sheets.FCFF.per_share[0];
  let lo = -0.5;
  // The search runs over the latest-year growth the fading path starts from; the answer is reported as average growth
  // over years 1-5, which means the same thing whichever growth path is selected.
  let hi = 10.0;
  const flo = f(lo);
  const fhi = f(hi);
  if (flo == null || fhi == null) return { growth: null, message: 'The reverse DCF needs a complete FCFF model.' };
  if ((flo - price) * (fhi - price) > 0)
    return { growth: null, message: 'No growth path of the kind the model uses reaches the current price under these assumptions.' };
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid)!;
    if ((flo - price) * (fm - price) <= 0) hi = mid;
    else lo = mid;
  }
  const g = (lo + hi) / 2;
  return { growth: avgGrowth5(evaluate(wb, { g_stage1: g })), message: '' };
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
  // A margin far above the industry is held for ever by default. Say so: profitability usually reverts (Fama & French).
  const peerM = a.peers.margin;
  if (!a.financial && peerM != null && a.marginTarget != null && a.marginTarget - peerM > MARGIN_GAP_NOTE)
    warnings.push(
      `The forecast holds a ${(a.marginTarget * 100).toFixed(1)}% operating margin for ever, ${((a.marginTarget - peerM) * 100).toFixed(0)} points above the industry average (${(peerM * 100).toFixed(1)}%, Damodaran). On average, about 38% of such a gap closes each year (Fama and French, 2000); the "Margin reverts to industry" scenario shows what that would mean.`,
    );
  const interest = current(h, 'interestExpense', a.basis);
  // Debt found but far below what the interest bill implies (segment-tagged debt at Deere or Caterpillar's finance arms).
  // Banks and insurers pay interest on deposits and policy funds, not just debt, so these checks do not apply to them.
  if (!a.financial && a.debt > 0 && interest != null && interest / 1e6 / (a.rf + 0.03) > 2 * a.debt)
    warnings.push(
      `Interest expense of $${(interest / 1e6).toFixed(0)}M suggests more debt than the $${a.debt.toFixed(0)}M found in the SEC data, which may miss debt reported by segment (a finance arm, for example). Check the 10-K balance sheet.`,
    );
  if (!a.financial && !a.debt && interest != null && a.rev0 && interest / 1e6 > 0.002 * a.rev0)
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
      ? reverseDcf(wb, values.inputs.price, values)
      : { growth: null, modelGrowth: null, message: a.financial ? 'Banks and insurers are valued on equity, so there is no free-cash-flow reverse DCF. See residual income and P/B.' : 'The reverse DCF needs a working FCFF model.' },
    sensitivity: fcffOk && a.terminalMethod === 'gordon' ? sensitivity(wb, values) : null,
    warnings,
  };
}

/**
 * The models' values without the reverse DCF and sensitivity grid: cheap enough to run once per saved scenario for the
 * comparison table and the editor's live preview.
 */
export function quickRun(h: Historicals, a: Assumptions, src: Sources): { wb: Workbook; values: Values; results: ModelResult[] } {
  const wb = buildWorkbook(h, a, src);
  const values = evaluate(wb);
  judge(wb, values, a);
  const results = wb.sheets
    .filter((s) => !s.id.startsWith('fcff_'))
    .map((s) => ({ id: s.id, sheet: s, perShare: resultOf(wb, values, s.id), status: s.status, message: s.message }));
  return { wb, values, results };
}
