import { ADJUST_FIELDS, type AdjustField, type Assumptions } from './assumptions';
import type { ModelId, RowDef, SheetDef } from './calcsheet';

/** Explicit forecast length and high-growth years (growth fades linearly to terminal over years 6-10). */
export const N = 10;
export const HIGH = 5;

/** Starting period of the forecast: a fiscal year, or the trailing twelve months (columns then read TTM, Yr 1 ... Yr 10). */
export type Base = number | 'ttm';
const cols = (base: Base) =>
  base === 'ttm'
    ? ['TTM', ...Array.from({ length: N }, (_, i) => `Yr ${i + 1}`)]
    : [`FY${base}`, ...Array.from({ length: N }, (_, i) => `FY${base + i + 1}`)];
const each = (f: (t: number) => string | number | null, from = 1): (string | number | null)[] =>
  Array.from({ length: N + 1 }, (_, t) => (t < from ? null : f(t)));
const at0 = (v: string | number): (string | number | null)[] => [v];
const atN = (v: string): (string | number | null)[] => Array.from({ length: N + 1 }, (_, t) => (t === N ? v : null));

interface FcffOpts {
  id: ModelId;
  name: string;
  title: string;
  g1: string;
  margin: string;
  capex: string;
  shares: string;
}

/**
 * Revenue growth path. A typical company's growth (g_typical) slides in a straight line to terminal growth by year 10,
 * and the company's growth above typical in its latest year (g1 - g_typical) fades on top of it:
 * - 'research' (default): it keeps g_decay of itself every year, McKinsey's observed decay of high growth;
 * - 'base': backtested on this site's data (scripts/calibrate-growth.ts): g_fade of it is left in year 1 and a lasting
 *   share (g_keep) persists for years, both reaching zero by year 10.
 * A boom is respected but not projected forward, so no growth cap is needed.
 */
const fade = (a: Assumptions, g1: string) => (t: number) => {
  const base = `g_typical+(g_terminal-g_typical)*${((t - 1) / (N - 1)).toFixed(6)}`;
  if ((a.growthMode ?? 'research') === 'research') return `=${base}+(${g1}-g_typical)*MIN(g_decay,0.99)^${t}`;
  const phi = 'MAX(0,(g_fade-g_keep)/(1-g_keep))';
  const w = ((N - t) / (N - 1)).toFixed(6);
  return `=${base}+(${g1}-g_typical)*${w}*(g_keep+(g_fade-g_keep)*${phi}^${t - 1})`;
};

/** Book-equity growth path for banks and insurers: stage-1 for years 1-5, then a straight-line fade to terminal growth. */
const growth = (g1: string) => (t: number) =>
  t <= HIGH ? `=${g1}` : `=${g1}-(${g1}-g_terminal)*${((t - HIGH) / (N - HIGH)).toFixed(4)}`;

/** Scenario adjustment rows: sheet row key, label and format for each Adjust field. Keys start with `sc_`. */
export const ADJUST_ROWS: Record<AdjustField, { key: string; label: string; fmt: RowDef['fmt'] }> = {
  growthAdd: { key: 'sc_g_add', label: 'Scenario: growth change', fmt: 'pct' },
  growthSetW: { key: 'sc_g_w', label: 'Scenario: growth set (1 = yes)', fmt: 'num' },
  growthSetV: { key: 'sc_g_v', label: 'Scenario: growth set to', fmt: 'pct' },
  growthCap: { key: 'sc_g_cap', label: 'Scenario: most growth allowed (capacity)', fmt: 'pct' },
  revStep: { key: 'sc_rev_step', label: 'Scenario: revenue step (1 = none)', fmt: 'num' },
  marginAdd: { key: 'sc_m_add', label: 'Scenario: margin change', fmt: 'pct' },
  marginSetW: { key: 'sc_m_w', label: 'Scenario: margin set (1 = yes)', fmt: 'num' },
  marginSetV: { key: 'sc_m_v', label: 'Scenario: margin set to', fmt: 'pct' },
  capex: { key: 'sc_capex', label: 'Scenario: capex change, % of revenue', fmt: 'pct' },
  rfAdd: { key: 'sc_rf', label: 'Scenario: risk-free rate change', fmt: 'pct' },
};

/** How much of a risk-free change reaches WACC: equity always, debt only when its cost follows the rate. */
const rfReach = (follows: boolean | undefined) => (follows === false ? '(1-w_debt)' : '((1-w_debt)+w_debt*(1-tax))');

/** Discount factors that follow a temporary rate path: each year compounds at the base rate plus that year's change. */
const pathDf = (rate: string) => ['=1', ...each((t) => `=@df[${t - 1}]/(1+${rate}+@FCFF.sc_rf[${t}])`).slice(1)];

export function fcffSheet(a: Assumptions, baseYear: Base, o: FcffOpts): SheetDef {
  // Scenario adjustments apply to the main FCFF sheet only, never to the AI-mode bear/base/bull copies.
  const adj = o.id === 'fcff' ? a.adjust : undefined;
  const has = (f: AdjustField) => !!adj?.[f];
  const r = (f: AdjustField, t: number) => `@${ADJUST_ROWS[f].key}[${t}]`;
  const growthCell = (t: number) => {
    const base = fade(a, o.g1)(t);
    if (!adj) return base;
    let g = base.slice(1);
    if (has('growthAdd')) g = `${g}+${r('growthAdd', t)}`;
    if (has('growthCap')) g = `MIN(${g},${r('growthCap', t)})`;
    if (has('growthSetW')) g = `(1-${r('growthSetW', t)})*(${g})+${r('growthSetW', t)}*${r('growthSetV', t)}`;
    return `=${g}`;
  };
  const marginCell = (t: number) => {
    const path = `margin_0+(${o.margin}-margin_0)*MIN(${t}/margin_years,1)`;
    if (!adj || !(has('marginAdd') || has('marginSetW'))) return `=${path}`;
    let m = path;
    if (has('marginAdd')) m = `${m}+${r('marginAdd', t)}`;
    if (has('marginSetW')) m = `(1-${r('marginSetW', t)})*(${m})+${r('marginSetW', t)}*${r('marginSetV', t)}`;
    // The -50% floor limits the scenario's change only: a base path already below it is never lifted.
    return `=MAX(${m},MIN(${path},-0.5))`;
  };
  const adjRows: RowDef[] = adj
    ? ADJUST_FIELDS.filter(has).map((f) => ({
        key: ADJUST_ROWS[f].key,
        label: ADJUST_ROWS[f].label,
        fmt: ADJUST_ROWS[f].fmt,
        cells: [null, ...adj[f]!.slice(1, N + 1)],
        note: 'Set by the active scenario. Neutral values leave the base case unchanged.',
      }))
    : [];
  const rows: RowDef[] = [
    ...adjRows,
    {
      key: 'growth',
      label: 'Revenue growth',
      fmt: 'pct',
      cells: each(growthCell),
      note:
        (a.growthMode ?? 'research') === 'research'
          ? 'Research path: growth above typical keeps a fixed share each year (McKinsey’s observed decay); typical growth slides to terminal growth by year 10.'
          : 'Base-rate path, backtested on S&P 500 revenue 2017-2025: most growth above typical is gone after a year, a lasting share fades out by year 10.',
    },
    {
      key: 'revenue',
      label: 'Revenue',
      fmt: 'usdm',
      cells: [`=rev_0`, ...each((t) => `=@revenue[${t - 1}]*(1+@growth[${t}])${has('revStep') ? `*${r('revStep', t)}` : ''}`).slice(1)],
    },
    {
      key: 'margin',
      label: 'Operating margin',
      fmt: 'pct',
      cells: ['=margin_0', ...each(marginCell).slice(1)],
      note: 'Moves in a straight line from today’s margin to the target, then holds.',
    },
    { key: 'ebit', label: 'Operating income (EBIT)', fmt: 'usdm', cells: each((t) => `=@revenue[${t}]*@margin[${t}]`, 0) },
    { key: 'nopat', label: 'EBIT × (1 - tax)', fmt: 'usdm', cells: each((t) => `=@ebit[${t}]*(1-tax)`) },
    { key: 'da', label: '+ Depreciation & amortisation', fmt: 'usdm', cells: each((t) => `=@revenue[${t}]*da_pct`) },
    {
      key: 'capex',
      label: '- Capital expenditure',
      fmt: 'usdm',
      cells: each((t) => {
        const share = t <= HIGH ? o.capex : `(${o.capex}+(MIN(da_pct,${o.capex})-${o.capex})*${((t - HIGH) / (N - HIGH)).toFixed(4)})`;
        // A scenario's capex path is a change on top of the model's path, so capex_pct keeps driving it (also in Excel).
        return has('capex') ? `=@revenue[${t}]*(${share}+${r('capex', t)})` : `=@revenue[${t}]*${share}`;
      }),
      note:
        'Held at its share of revenue for five years. If it runs above D&A, it then falls to D&A by year 10: a mature company spends roughly what it depreciates. Capex below D&A (amortisation of acquired intangibles, which never needs replacing) is left alone.' +
        (has('capex') ? ' The scenario’s capex change (row above) is added on top.' : ''),
    },
    { key: 'dnwc', label: '- Increase in working capital', fmt: 'usdm', cells: each((t) => `=(@revenue[${t}]-@revenue[${t - 1}])*nwc_pct`) },
    { key: 'fcff', label: 'Free cash flow to the firm', fmt: 'usdm', emphasis: true, cells: each((t) => `=@nopat[${t}]+@da[${t}]-@capex[${t}]-@dnwc[${t}]`) },
    has('rfAdd')
      ? {
          key: 'df',
          label: 'Discount factor at WACC (with the scenario’s rate path)',
          fmt: 'num',
          cells: ['=1', ...each((t) => `=@df[${t - 1}]/(1+wacc+@sc_rf[${t}]*${rfReach(adj!.rdFollowsRf)})`).slice(1)],
        }
      : { key: 'df', label: 'Discount factor at WACC', fmt: 'num', cells: each((t) => `=1/(1+wacc)^${t}`) },
    { key: 'pv', label: 'Present value of FCFF', fmt: 'usdm', cells: each((t) => `=@fcff[${t}]*@df[${t}]`) },
    a.terminalMethod === 'exit'
      ? { key: 'tv', label: 'Terminal value (exit EV/EBITDA)', fmt: 'usdm', cells: atN(`=(@ebit[${N}]+@da[${N}])*exit_multiple`) }
      : { key: 'tv', label: 'Terminal value (Gordon growth)', fmt: 'usdm', cells: atN(`=@fcff[${N}]*(1+g_terminal)/(wacc-g_terminal)`) },
    { key: 'pv_tv', label: 'Present value of terminal value', fmt: 'usdm', cells: atN(`=@tv[${N}]*@df[${N}]`) },
    { key: 'ev', label: 'Enterprise value', fmt: 'usdm', emphasis: true, cells: at0(`=SUM(@pv[1]:@pv[${N}])+@pv_tv[${N}]`) },
    { key: 'tv_share', label: 'Terminal value share of EV', fmt: 'pct', cells: at0(`=@pv_tv[${N}]/@ev[0]`) },
    { key: 'equity', label: '- Net debt (+ net cash) = equity value', fmt: 'usdm', cells: at0('=@ev[0]-net_debt') },
    { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: at0(`=@equity[0]/${o.shares}`) },
  ];
  return { id: o.id, name: o.name, title: o.title, columns: cols(baseYear), rows, result: { row: 'per_share', col: 0 }, status: 'ok' };
}

export function fcfeSheet(baseYear: Base, ratePath = false): SheetDef {
  const rows: RowDef[] = [
    { key: 'ebit', label: 'Operating income (from FCFF)', fmt: 'usdm', cells: each((t) => `=@FCFF.ebit[${t}]`) },
    { key: 'interest', label: '- Interest (debt × cost of debt)', fmt: 'usdm', cells: each(() => '=debt*rd') },
    { key: 'ni', label: 'Net income', fmt: 'usdm', cells: each((t) => `=(@ebit[${t}]-@interest[${t}])*(1-tax)`) },
    {
      key: 'reinvest',
      label: 'Net reinvestment (capex - D&A + working capital)',
      fmt: 'usdm',
      cells: each((t) => `=@FCFF.capex[${t}]-@FCFF.da[${t}]+@FCFF.dnwc[${t}]`),
    },
    {
      key: 'fcfe',
      label: 'Free cash flow to equity',
      fmt: 'usdm',
      emphasis: true,
      cells: each((t) => `=@ni[${t}]-(1-w_debt)*@reinvest[${t}]`),
      note: 'Reinvestment is funded with debt in proportion to the current debt weight, so leverage stays constant.',
    },
    { key: 'df', label: 'Discount factor at cost of equity', fmt: 'num', cells: ratePath ? pathDf('re') : each((t) => `=1/(1+re)^${t}`) },
    { key: 'pv', label: 'Present value of FCFE', fmt: 'usdm', cells: each((t) => `=@fcfe[${t}]*@df[${t}]`) },
    { key: 'tv', label: 'Terminal value (Gordon growth)', fmt: 'usdm', cells: atN(`=@fcfe[${N}]*(1+g_terminal)/(re-g_terminal)`) },
    { key: 'pv_tv', label: 'Present value of terminal value', fmt: 'usdm', cells: atN(`=@tv[${N}]*@df[${N}]`) },
    { key: 'equity', label: 'Equity value (+ cash and investments)', fmt: 'usdm', emphasis: true, cells: at0(`=SUM(@pv[1]:@pv[${N}])+@pv_tv[${N}]+cash+sti`) },
    { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: at0('=@equity[0]/shares') },
  ];
  return { id: 'fcfe', name: 'FCFE', title: 'Free cash flow to equity', columns: cols(baseYear), rows, result: { row: 'per_share', col: 0 }, status: 'ok' };
}

export function apvSheet(baseYear: Base, ratePath = false): SheetDef {
  const rows: RowDef[] = [
    { key: 'fcff', label: 'Free cash flow to the firm (from FCFF)', fmt: 'usdm', cells: each((t) => `=@FCFF.fcff[${t}]`) },
    { key: 'df', label: 'Discount factor at unlevered cost of equity', fmt: 'num', cells: ratePath ? pathDf('ru') : each((t) => `=1/(1+ru)^${t}`) },
    { key: 'pv', label: 'Present value', fmt: 'usdm', cells: each((t) => `=@fcff[${t}]*@df[${t}]`) },
    { key: 'tv', label: 'Terminal value (Gordon growth)', fmt: 'usdm', cells: atN(`=@fcff[${N}]*(1+g_terminal)/(ru-g_terminal)`) },
    { key: 'pv_tv', label: 'Present value of terminal value', fmt: 'usdm', cells: atN(`=@tv[${N}]*@df[${N}]`) },
    { key: 'vu', label: 'Value of the unlevered firm', fmt: 'usdm', cells: at0(`=SUM(@pv[1]:@pv[${N}])+@pv_tv[${N}]`) },
    {
      key: 'shield',
      label: '+ Present value of interest tax shields',
      fmt: 'usdm',
      cells: at0('=tax*debt'),
      note: 'Permanent debt with shields discounted at the cost of debt: PV = t × rd × D / rd = t × D. Expected distress costs are not modelled.',
    },
    { key: 'apv', label: 'Adjusted present value (EV)', fmt: 'usdm', emphasis: true, cells: at0('=@vu[0]+@shield[0]') },
    { key: 'equity', label: '- Net debt (+ net cash) = equity value', fmt: 'usdm', cells: at0('=@apv[0]-net_debt') },
    { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: at0('=@equity[0]/shares') },
  ];
  return { id: 'apv', name: 'APV', title: 'Adjusted present value', columns: cols(baseYear), rows, result: { row: 'per_share', col: 0 }, status: 'ok' };
}

export function riSheet(baseYear: Base, ratePath = false): SheetDef {
  const rows: RowDef[] = [
    { key: 'ni', label: 'Net income (from FCFE)', fmt: 'usdm', cells: each((t) => `=@FCFE.ni[${t}]`) },
    {
      key: 'div',
      label: '- Cash returned to shareholders (= FCFE)',
      fmt: 'usdm',
      cells: each((t) => `=@FCFE.fcfe[${t}]`),
      note: 'Clean surplus: book equity grows only by what is reinvested, which keeps this model consistent with FCFE.',
    },
    {
      key: 'book',
      label: 'Operating book equity, end of year',
      fmt: 'usdm',
      cells: ['=equity_0-cash-sti', ...each((t) => `=@book[${t - 1}]+@ni[${t}]-@div[${t}]`).slice(1)],
      note: 'Book equity less cash and investments. The forecast earns no interest on cash, so charging the cost of equity on it would value it near zero; it is added back at face value below, as in FCFE.',
    },
    { key: 'charge', label: 'Equity charge (re × opening book)', fmt: 'usdm', cells: each((t) => `=re*@book[${t - 1}]`) },
    { key: 'ri', label: 'Residual income', fmt: 'usdm', emphasis: true, cells: each((t) => `=@ni[${t}]-@charge[${t}]`) },
    { key: 'df', label: 'Discount factor at cost of equity', fmt: 'num', cells: ratePath ? pathDf('re') : each((t) => `=1/(1+re)^${t}`) },
    { key: 'pv', label: 'Present value of residual income', fmt: 'usdm', cells: each((t) => `=@ri[${t}]*@df[${t}]`) },
    { key: 'tv', label: 'Terminal value of residual income', fmt: 'usdm', cells: atN(`=@ri[${N}]*(1+g_terminal)/(re-g_terminal)`) },
    { key: 'pv_tv', label: 'Present value of terminal value', fmt: 'usdm', cells: atN(`=@tv[${N}]*@df[${N}]`) },
    {
      key: 'equity',
      label: 'Book + PV of residual income + cash and investments',
      fmt: 'usdm',
      emphasis: true,
      cells: at0(`=@book[0]+SUM(@pv[1]:@pv[${N}])+@pv_tv[${N}]+cash+sti`),
    },
    { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: at0('=@equity[0]/shares') },
  ];
  return { id: 'ri', name: 'ResidualIncome', title: 'Residual income', columns: cols(baseYear), rows, result: { row: 'per_share', col: 0 }, status: 'ok' };
}

/**
 * Residual income for banks and insurers: book equity is the operating base, so it grows with the growth path and
 * earns the return on equity. Value = book + PV of (ROE - cost of equity) × opening book.
 */
export function riFinancialSheet(baseYear: Base, ratePath = false): SheetDef {
  const rows: RowDef[] = [
    { key: 'growth', label: 'Book equity growth', fmt: 'pct', cells: each(growth('g_stage1')) },
    { key: 'book', label: 'Book equity, end of year', fmt: 'usdm', cells: ['=equity_0', ...each((t) => `=@book[${t - 1}]*(1+@growth[${t}])`).slice(1)] },
    {
      key: 'roe',
      label: 'Return on equity',
      fmt: 'pct',
      cells: each((t) => (t <= HIGH ? '=roe' : `=roe-(roe-re)*0.5*${((t - HIGH) / (N - HIGH)).toFixed(4)}`)),
      note: 'Held for five years, then half the gap to the cost of equity closes by year 10: competition erodes excess returns.',
    },
    { key: 'ni', label: 'Net income (ROE × opening book)', fmt: 'usdm', cells: each((t) => `=@roe[${t}]*@book[${t - 1}]`) },
    { key: 'charge', label: 'Equity charge (re × opening book)', fmt: 'usdm', cells: each((t) => `=re*@book[${t - 1}]`) },
    {
      key: 'ri',
      label: 'Residual income',
      fmt: 'usdm',
      emphasis: true,
      cells: each((t) => `=@ni[${t}]-@charge[${t}]`),
      note: 'A bank earning exactly its cost of equity is worth its book value.',
    },
    { key: 'df', label: 'Discount factor at cost of equity', fmt: 'num', cells: ratePath ? pathDf('re') : each((t) => `=1/(1+re)^${t}`) },
    { key: 'pv', label: 'Present value of residual income', fmt: 'usdm', cells: each((t) => `=@ri[${t}]*@df[${t}]`) },
    { key: 'tv', label: 'Terminal value of residual income', fmt: 'usdm', cells: atN(`=@ri[${N}]*(1+g_terminal)/(re-g_terminal)`) },
    { key: 'pv_tv', label: 'Present value of terminal value', fmt: 'usdm', cells: atN(`=@tv[${N}]*@df[${N}]`) },
    { key: 'equity', label: 'Book equity + PV of residual income', fmt: 'usdm', emphasis: true, cells: at0(`=@book[0]+SUM(@pv[1]:@pv[${N}])+@pv_tv[${N}]`) },
    { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: at0('=@equity[0]/shares') },
  ];
  return { id: 'ri', name: 'ResidualIncome', title: 'Residual income (financial firm)', columns: cols(baseYear), rows, result: { row: 'per_share', col: 0 }, status: 'ok' };
}

export function ddmSheets(): SheetDef[] {
  const gordon: SheetDef = {
    id: 'ddm_gordon',
    name: 'DDM_Gordon',
    title: 'Gordon growth (one stage)',
    columns: ['Value'],
    rows: [
      { key: 'd0', label: 'Dividend per share, last year (D0)', fmt: 'usd', cells: ['=dps_0'] },
      { key: 'd1', label: 'Next dividend D1 = D0 × (1 + g)', fmt: 'usd', cells: ['=@d0[0]*(1+g_terminal)'] },
      { key: 'per_share', label: 'Value = D1 / (re - g)', fmt: 'usd', emphasis: true, cells: ['=@d1[0]/(re-g_terminal)'] },
    ],
    result: { row: 'per_share', col: 0 },
    status: 'ok',
  };
  const yrs = [`Now`, ...Array.from({ length: HIGH }, (_, i) => `Year ${i + 1}`)];
  const e = (f: (t: number) => string) => Array.from({ length: HIGH + 1 }, (_, t) => (t === 0 ? null : f(t)));
  const two: SheetDef = {
    id: 'ddm_2stage',
    name: 'DDM_TwoStage',
    title: 'Two-stage dividend discount',
    columns: yrs,
    rows: [
      { key: 'dps', label: 'Dividend per share (grows with the revenue forecast)', fmt: 'usd', cells: ['=dps_0', ...e((t) => `=@dps[${t - 1}]*(1+@FCFF.growth[${t}])`).slice(1)] },
      { key: 'pv', label: 'Present value at cost of equity', fmt: 'usd', cells: e((t) => `=@dps[${t}]/(1+re)^${t}`) },
      {
        key: 'tv',
        label: 'Terminal value at year 5 (Gordon)',
        fmt: 'usd',
        cells: Array.from({ length: HIGH + 1 }, (_, t) => (t === HIGH ? `=@dps[${HIGH}]*(1+g_terminal)/(re-g_terminal)` : null)),
      },
      { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: [`=SUM(@pv[1]:@pv[${HIGH}])+@tv[${HIGH}]/(1+re)^${HIGH}`] },
    ],
    result: { row: 'per_share', col: 0 },
    status: 'ok',
  };
  const h: SheetDef = {
    id: 'ddm_h',
    name: 'DDM_HModel',
    title: 'H-model (growth fades linearly)',
    columns: ['Value'],
    rows: [
      { key: 'stable', label: 'Stable part: D0 × (1 + gL) / (re - gL)', fmt: 'usd', cells: ['=dps_0*(1+g_terminal)/(re-g_terminal)'] },
      { key: 'extra', label: 'Extra growth: D0 × H × (gS - gL) / (re - gL)', fmt: 'usd', cells: ['=dps_0*h_half_life*(@FCFF.growth[1]-g_terminal)/(re-g_terminal)'] },
      { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: ['=@stable[0]+@extra[0]'] },
    ],
    result: { row: 'per_share', col: 0 },
    status: 'ok',
  };
  return [gordon, two, h];
}

/**
 * Total payout model: the dividend discount model widened to everything shareholders receive. Dividends plus buybacks,
 * net of stock-based pay, as a share of earnings; earnings grow with the revenue forecast for five years, then at terminal
 * growth, when the payout rises to what a mature company can afford (1 - g / re). Discounted at the cost of equity and
 * divided by today's shares, so buybacks are not double counted.
 */
export function totalPayoutSheet(): SheetDef {
  const yrs = [`Now`, ...Array.from({ length: HIGH }, (_, i) => `Year ${i + 1}`)];
  const e = (f: (t: number) => string) => Array.from({ length: HIGH + 1 }, (_, t) => (t === 0 ? null : f(t)));
  return {
    id: 'total_payout',
    name: 'TotalPayout',
    title: 'Total payout (dividends + buybacks)',
    columns: yrs,
    rows: [
      { key: 'ni', label: 'Net income (grows with the revenue forecast)', fmt: 'usdm', cells: ['=ni_0', ...e((t) => `=@ni[${t - 1}]*(1+@FCFF.growth[${t}])`).slice(1)] },
      { key: 'paid', label: 'Paid to shareholders: net income × total payout ratio', fmt: 'usdm', cells: ['=@ni[0]*tp_ratio', ...e((t) => `=@ni[${t}]*tp_ratio`).slice(1)] },
      { key: 'pv', label: 'Present value at cost of equity', fmt: 'usdm', cells: e((t) => `=@paid[${t}]/(1+re)^${t}`) },
      {
        // Once growth slows, a company only needs to retain g / re of earnings to keep growing (at a return equal to its
        // cost of equity), so the payout rises to 1 - g / re unless it already pays out more.
        key: 'tv_payout',
        label: 'Payout after year 5: the higher of today’s and 1 - g / re',
        fmt: 'pct',
        cells: Array.from({ length: HIGH + 1 }, (_, t) => (t === HIGH ? '=MAX(tp_ratio,1-g_terminal/re)' : null)),
      },
      {
        key: 'tv',
        label: 'Terminal value at year 5: net income × (1 + g) × payout / (re - g)',
        fmt: 'usdm',
        cells: Array.from({ length: HIGH + 1 }, (_, t) => (t === HIGH ? `=@ni[${HIGH}]*(1+g_terminal)*@tv_payout[${HIGH}]/(re-g_terminal)` : null)),
      },
      { key: 'equity', label: 'Equity value', fmt: 'usdm', cells: [`=SUM(@pv[1]:@pv[${HIGH}])+@tv[${HIGH}]/(1+re)^${HIGH}`] },
      { key: 'per_share', label: 'Value per share = equity value / shares', fmt: 'usd', emphasis: true, cells: ['=@equity[0]/shares'] },
    ],
    result: { row: 'per_share', col: 0 },
    status: 'ok',
  };
}

/** Multiples. Rows whose base metric is negative or whose peer multiple is missing are left blank. */
/**
 * EV/Sales scaled to the company's margin. A revenue multiple is only fair at a similar profitability: a company with
 * half its peers' operating margin deserves about half their EV/Sales (the ratio may cut the multiple to zero but raise it by at most 1.5x, because the
 * industry average already reflects its most profitable members). A company
 * with an operating loss cannot be valued on revenue at all, so the row is skipped.
 */
function evSalesRow(a: Assumptions): RowDef {
  const margin = a.marginTarget ?? a.margin0;
  const peerMargin = a.peers.margin ?? null;
  const usable = !a.financial && a.rev0 != null && a.rev0 > 0 && a.peers.evSales != null && margin != null && margin > 0;
  const scaled = peerMargin != null && peerMargin > 0;
  return {
    key: 'ev_sales',
    label: scaled ? 'EV/Sales, margin-adjusted: (revenue × peer multiple × margin ÷ peer margin - net debt) / shares' : 'EV/Sales: (revenue × multiple - net debt) / shares',
    fmt: 'usd',
    cells: ['=rev_0', scaled ? '=ev_sales_peer*MIN(1.5,MAX(0,margin_target/margin_peer))' : '=ev_sales_peer', usable ? '=MAX(0,(@ev_sales[0]*@ev_sales[1]-net_debt)/shares)' : null],
    note:
      !a.financial && margin != null && margin <= 0
        ? 'Skipped: a revenue multiple cannot value a company with an operating loss.'
        : scaled
          ? 'The peer multiple is scaled by this company’s target operating margin over the peers’ margin.'
          : undefined,
  };
}

/**
 * P/B scaled to the company's return on equity, for the same reason: book value is worth a multiple only in proportion
 * to what it earns (justified P/B rises with ROE). A company losing money on its equity is not valued on book here.
 */
const PB_MAX_NONFINANCIAL = 10;

function pbRow(a: Assumptions): RowDef {
  const roe = a.ni0 != null && a.equity0 != null && a.equity0 > 0 ? a.ni0 / a.equity0 : null;
  const peerRoe = a.peers.roe ?? null;
  const scaled = peerRoe != null && peerRoe > 0;
  // Outside banks and insurers, an industry trading above 10x book has book values too small to anchor anything
  // (restaurants, where years of buybacks leave little or negative equity), so P/B is left out there.
  const bookAnchors = a.financial || (a.peers.pb != null && a.peers.pb <= PB_MAX_NONFINANCIAL);
  const usable = bookAnchors && a.equity0 != null && a.equity0 > 0 && a.peers.pb != null && (!scaled || (roe != null && roe > 0));
  return {
    key: 'pb',
    label: scaled ? 'P/B, return-adjusted: book value per share × peer P/B × ROE ÷ peer ROE' : 'P/B: book value per share × peer P/B',
    fmt: 'usd',
    cells: ['=equity_0/shares', scaled ? '=pb_peer*MIN(1.5,MAX(0,(ni_0/equity_0)/roe_peer))' : '=pb_peer', usable ? '=@pb[0]*@pb[1]' : null],
    note:
      !bookAnchors
        ? `Skipped: peers trade at ${a.peers.pb?.toFixed(0)}x book, so book value is too small to anchor a valuation in this industry.`
        : scaled && roe != null && roe <= 0
        ? 'Skipped: book value earning a negative return cannot be valued on a peer multiple.'
        : scaled
          ? usable
            ? 'The peer multiple is scaled by this company’s return on equity over the peers’.'
            : 'Skipped: needs positive book equity and a peer P/B.'
          : usable
            ? undefined
            : 'Skipped: needs positive book equity and a peer P/B.',
  };
}

export function multiplesSheet(a: Assumptions, ebitda0: number | null): SheetDef {
  const eps = a.ni0 != null && a.shares ? a.ni0 / a.shares : null;
  const ok = (metric: number | null, peer: number | null) => metric != null && metric > 0 && peer != null;
  const rows: RowDef[] = [
    {
      key: 'pe',
      label: 'P/E: EPS × peer P/E',
      fmt: 'usd',
      cells: ['=ni_0/shares', '=pe_peer', ok(eps, a.peers.pe) ? '=@pe[0]*@pe[1]' : null],
    },
    {
      key: 'ev_ebitda',
      label: 'EV/EBITDA: (EBITDA × multiple - net debt) / shares',
      fmt: 'usd',
      // Not for banks and insurers: their debt is operating funding, so enterprise value means nothing.
      cells: ['=ebit_0+da_0', '=ev_ebitda_peer', !a.financial && ok(ebitda0, a.peers.evEbitda) ? '=MAX(0,(@ev_ebitda[0]*@ev_ebitda[1]-net_debt)/shares)' : null],
    },
    evSalesRow(a),
    pbRow(a),
    {
      key: 'peg',
      label: 'PEG: EPS × average growth, years 1-5 (in %) × peer PEG',
      fmt: 'usd',
      cells: ['=ni_0/shares', '=peg_peer', ok(eps, a.peers.peg) && a.g1 > 0 ? '=@peg[0]*AVERAGE(@FCFF.growth[1],@FCFF.growth[2],@FCFF.growth[3],@FCFF.growth[4],@FCFF.growth[5])*100*@peg[1]' : null],
    },
  ];
  const used = rows.filter((r) => r.cells[2] != null);
  const skipped = rows.filter((r) => r.cells[2] == null).map((r) => r.label.split(/[:,]/)[0]);
  const implied = used.map((r) => `@${r.key}[2]`);
  rows.push({
    key: 'per_share',
    label: used.length === 1 ? `Based on one multiple only (${used[0].label.split(':')[0]})` : `Average of ${used.map((r) => r.label.split(/[:,]/)[0]).join(', ')}`,
    fmt: 'usd',
    emphasis: true,
    cells: [null, null, implied.length ? `=AVERAGE(${implied.join(',')})` : null],
    note:
      used.length === 1
        ? 'Only one multiple applies (the others need positive earnings), so treat this as a rough guide rather than a valuation.'
        : skipped.length
          ? `${skipped.join(', ')} left out of the average (see the note on that row).`
          : undefined,
  });
  return {
    id: 'multiples',
    name: 'Multiples',
    title: 'Relative valuation (multiples)',
    columns: ['Company metric', 'Peer multiple', 'Implied value per share'],
    rows,
    result: { row: 'per_share', col: 2 },
    status: implied.length ? 'ok' : 'needs-input',
    message: !implied.length
      ? 'Enter at least one peer multiple.'
      : used.length === 1
        ? `Based on one multiple only (${used[0].label.split(':')[0]}): the others need positive earnings. Treat it as a rough guide.`
        : undefined,
  };
}

export function scenarioSheets(a: Assumptions, baseYear: Base): SheetDef[] {
  const sc = (['bear', 'base', 'bull'] as const).map((s) =>
    fcffSheet(a, baseYear, {
      id: `fcff_${s}` as ModelId,
      name: `FCFF_${s[0].toUpperCase()}${s.slice(1)}`,
      title: `FCFF, ${s} case`,
      g1: `g1_${s}`,
      margin: `margin_${s}`,
      capex: `capex_${s}`,
      shares: '(shares+new_shares)',
    }),
  );
  const summary: SheetDef = {
    id: 'scenarios',
    name: 'Scenarios',
    title: 'Scenario-weighted DCF',
    columns: ['Value per share', 'Probability', 'Weighted'],
    rows: [
      ...(['bear', 'base', 'bull'] as const).map((s, i) => ({
        key: s,
        label: `${s[0].toUpperCase()}${s.slice(1)} case`,
        fmt: 'usd' as const,
        cells: [`=@${sc[i].name}.per_share[0]`, `=prob_${s}`, `=@${s}[0]*@${s}[1]`],
      })),
      { key: 'per_share', label: 'Probability-weighted value per share', fmt: 'usd', emphasis: true, cells: [null, '=prob_bear+prob_base+prob_bull', '=@bear[2]+@base[2]+@bull[2]'] },
    ],
    result: { row: 'per_share', col: 2 },
    status: 'ok',
  };
  return [...sc, summary];
}
