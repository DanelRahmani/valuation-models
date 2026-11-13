import type { Assumptions } from './assumptions';
import type { ModelId, RowDef, SheetDef } from './calcsheet';

/** Explicit forecast length and high-growth years (growth fades linearly to terminal over years 6-10). */
export const N = 10;
export const HIGH = 5;

const cols = (baseYear: number) => [`FY${baseYear}`, ...Array.from({ length: N }, (_, i) => `FY${baseYear + i + 1}`)];
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

/** Growth path: stage-1 for years 1-5, then a straight-line fade to terminal growth. */
const growth = (g1: string) => (t: number) =>
  t <= HIGH ? `=${g1}` : `=${g1}-(${g1}-g_terminal)*${((t - HIGH) / (N - HIGH)).toFixed(4)}`;

export function fcffSheet(a: Assumptions, baseYear: number, o: FcffOpts): SheetDef {
  const rows: RowDef[] = [
    { key: 'growth', label: 'Revenue growth', fmt: 'pct', cells: each(growth(o.g1)) },
    { key: 'revenue', label: 'Revenue', fmt: 'usdm', cells: [`=rev_0`, ...each((t) => `=@revenue[${t - 1}]*(1+@growth[${t}])`).slice(1)] },
    {
      key: 'margin',
      label: 'Operating margin',
      fmt: 'pct',
      cells: ['=margin_0', ...each((t) => `=margin_0+(${o.margin}-margin_0)*MIN(${t}/margin_years,1)`).slice(1)],
      note: 'Moves in a straight line from today’s margin to the target, then holds.',
    },
    { key: 'ebit', label: 'Operating income (EBIT)', fmt: 'usdm', cells: each((t) => `=@revenue[${t}]*@margin[${t}]`, 0) },
    { key: 'nopat', label: 'EBIT × (1 - tax)', fmt: 'usdm', cells: each((t) => `=@ebit[${t}]*(1-tax)`) },
    { key: 'da', label: '+ Depreciation & amortisation', fmt: 'usdm', cells: each((t) => `=@revenue[${t}]*da_pct`) },
    {
      key: 'capex',
      label: '- Capital expenditure',
      fmt: 'usdm',
      cells: each((t) =>
        t <= HIGH
          ? `=@revenue[${t}]*${o.capex}`
          : `=@revenue[${t}]*(${o.capex}+(MIN(da_pct,${o.capex})-${o.capex})*${((t - HIGH) / (N - HIGH)).toFixed(4)})`,
      ),
      note: 'Held at its share of revenue for five years. If it runs above D&A, it then falls to D&A by year 10: a mature company spends roughly what it depreciates. Capex below D&A (amortisation of acquired intangibles, which never needs replacing) is left alone.',
    },
    { key: 'dnwc', label: '- Increase in working capital', fmt: 'usdm', cells: each((t) => `=(@revenue[${t}]-@revenue[${t - 1}])*nwc_pct`) },
    { key: 'fcff', label: 'Free cash flow to the firm', fmt: 'usdm', emphasis: true, cells: each((t) => `=@nopat[${t}]+@da[${t}]-@capex[${t}]-@dnwc[${t}]`) },
    { key: 'df', label: 'Discount factor at WACC', fmt: 'num', cells: each((t) => `=1/(1+wacc)^${t}`) },
    { key: 'pv', label: 'Present value of FCFF', fmt: 'usdm', cells: each((t) => `=@fcff[${t}]*@df[${t}]`) },
    a.terminalMethod === 'exit'
      ? { key: 'tv', label: 'Terminal value (exit EV/EBITDA)', fmt: 'usdm', cells: atN(`=(@ebit[${N}]+@da[${N}])*exit_multiple`) }
      : { key: 'tv', label: 'Terminal value (Gordon growth)', fmt: 'usdm', cells: atN(`=@fcff[${N}]*(1+g_terminal)/(wacc-g_terminal)`) },
    { key: 'pv_tv', label: 'Present value of terminal value', fmt: 'usdm', cells: atN(`=@tv[${N}]*@df[${N}]`) },
    { key: 'ev', label: 'Enterprise value', fmt: 'usdm', emphasis: true, cells: at0(`=SUM(@pv[1]:@pv[${N}])+@pv_tv[${N}]`) },
    { key: 'tv_share', label: 'Terminal value share of EV', fmt: 'pct', cells: at0(`=@pv_tv[${N}]/@ev[0]`) },
    { key: 'equity', label: '- Net debt = equity value', fmt: 'usdm', cells: at0('=@ev[0]-net_debt') },
    { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: at0(`=@equity[0]/${o.shares}`) },
  ];
  return { id: o.id, name: o.name, title: o.title, columns: cols(baseYear), rows, result: { row: 'per_share', col: 0 }, status: 'ok' };
}

export function fcfeSheet(baseYear: number): SheetDef {
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
    { key: 'df', label: 'Discount factor at cost of equity', fmt: 'num', cells: each((t) => `=1/(1+re)^${t}`) },
    { key: 'pv', label: 'Present value of FCFE', fmt: 'usdm', cells: each((t) => `=@fcfe[${t}]*@df[${t}]`) },
    { key: 'tv', label: 'Terminal value (Gordon growth)', fmt: 'usdm', cells: atN(`=@fcfe[${N}]*(1+g_terminal)/(re-g_terminal)`) },
    { key: 'pv_tv', label: 'Present value of terminal value', fmt: 'usdm', cells: atN(`=@tv[${N}]*@df[${N}]`) },
    { key: 'equity', label: 'Equity value (+ cash and investments)', fmt: 'usdm', emphasis: true, cells: at0(`=SUM(@pv[1]:@pv[${N}])+@pv_tv[${N}]+cash+sti`) },
    { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: at0('=@equity[0]/shares') },
  ];
  return { id: 'fcfe', name: 'FCFE', title: 'Free cash flow to equity', columns: cols(baseYear), rows, result: { row: 'per_share', col: 0 }, status: 'ok' };
}

export function apvSheet(baseYear: number): SheetDef {
  const rows: RowDef[] = [
    { key: 'fcff', label: 'Free cash flow to the firm (from FCFF)', fmt: 'usdm', cells: each((t) => `=@FCFF.fcff[${t}]`) },
    { key: 'df', label: 'Discount factor at unlevered cost of equity', fmt: 'num', cells: each((t) => `=1/(1+ru)^${t}`) },
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
    { key: 'equity', label: '- Net debt = equity value', fmt: 'usdm', cells: at0('=@apv[0]-net_debt') },
    { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: at0('=@equity[0]/shares') },
  ];
  return { id: 'apv', name: 'APV', title: 'Adjusted present value', columns: cols(baseYear), rows, result: { row: 'per_share', col: 0 }, status: 'ok' };
}

export function riSheet(baseYear: number): SheetDef {
  const rows: RowDef[] = [
    { key: 'ni', label: 'Net income (from FCFE)', fmt: 'usdm', cells: each((t) => `=@FCFE.ni[${t}]`) },
    {
      key: 'div',
      label: '- Cash returned to shareholders (= FCFE)',
      fmt: 'usdm',
      cells: each((t) => `=@FCFE.fcfe[${t}]`),
      note: 'Clean surplus: book equity grows only by what is reinvested, which keeps this model consistent with FCFE.',
    },
    { key: 'book', label: 'Book equity, end of year', fmt: 'usdm', cells: ['=equity_0', ...each((t) => `=@book[${t - 1}]+@ni[${t}]-@div[${t}]`).slice(1)] },
    { key: 'charge', label: 'Equity charge (re × opening book)', fmt: 'usdm', cells: each((t) => `=re*@book[${t - 1}]`) },
    { key: 'ri', label: 'Residual income', fmt: 'usdm', emphasis: true, cells: each((t) => `=@ni[${t}]-@charge[${t}]`) },
    { key: 'df', label: 'Discount factor at cost of equity', fmt: 'num', cells: each((t) => `=1/(1+re)^${t}`) },
    { key: 'pv', label: 'Present value of residual income', fmt: 'usdm', cells: each((t) => `=@ri[${t}]*@df[${t}]`) },
    { key: 'tv', label: 'Terminal value of residual income', fmt: 'usdm', cells: atN(`=@ri[${N}]*(1+g_terminal)/(re-g_terminal)`) },
    { key: 'pv_tv', label: 'Present value of terminal value', fmt: 'usdm', cells: atN(`=@tv[${N}]*@df[${N}]`) },
    { key: 'equity', label: 'Book equity + PV of residual income', fmt: 'usdm', emphasis: true, cells: at0(`=@book[0]+SUM(@pv[1]:@pv[${N}])+@pv_tv[${N}]`) },
    { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: at0('=@equity[0]/shares') },
  ];
  return { id: 'ri', name: 'ResidualIncome', title: 'Residual income', columns: cols(baseYear), rows, result: { row: 'per_share', col: 0 }, status: 'ok' };
}

/**
 * Residual income for banks and insurers: book equity is the operating base, so it grows with the growth path and
 * earns the return on equity. Value = book + PV of (ROE - cost of equity) × opening book.
 */
export function riFinancialSheet(baseYear: number): SheetDef {
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
    { key: 'df', label: 'Discount factor at cost of equity', fmt: 'num', cells: each((t) => `=1/(1+re)^${t}`) },
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
      { key: 'dps', label: 'Dividend per share (grows at stage-1 rate)', fmt: 'usd', cells: ['=dps_0', ...e((t) => `=@dps[${t - 1}]*(1+g_stage1)`).slice(1)] },
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
      { key: 'extra', label: 'Extra growth: D0 × H × (gS - gL) / (re - gL)', fmt: 'usd', cells: ['=dps_0*h_half_life*(g_stage1-g_terminal)/(re-g_terminal)'] },
      { key: 'per_share', label: 'Value per share', fmt: 'usd', emphasis: true, cells: ['=@stable[0]+@extra[0]'] },
    ],
    result: { row: 'per_share', col: 0 },
    status: 'ok',
  };
  return [gordon, two, h];
}

/** Multiples. Rows whose base metric is negative or whose peer multiple is missing are left blank. */
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
      cells: ['=ebit_0+da_0', '=ev_ebitda_peer', !a.financial && ok(ebitda0, a.peers.evEbitda) ? '=(@ev_ebitda[0]*@ev_ebitda[1]-net_debt)/shares' : null],
    },
    {
      key: 'ev_sales',
      label: 'EV/Sales: (revenue × multiple - net debt) / shares',
      fmt: 'usd',
      cells: ['=rev_0', '=ev_sales_peer', !a.financial && ok(a.rev0, a.peers.evSales) ? '=(@ev_sales[0]*@ev_sales[1]-net_debt)/shares' : null],
    },
    {
      key: 'pb',
      label: 'P/B: book value per share × peer P/B',
      fmt: 'usd',
      cells: ['=equity_0/shares', '=pb_peer', ok(a.equity0, a.peers.pb) ? '=@pb[0]*@pb[1]' : null],
    },
    {
      key: 'peg',
      label: 'PEG: EPS × growth (in %) × peer PEG',
      fmt: 'usd',
      cells: ['=ni_0/shares', '=peg_peer', ok(eps, a.peers.peg) && a.g1 > 0 ? '=@peg[0]*g_stage1*100*@peg[1]' : null],
    },
  ];
  const implied = rows.filter((r) => r.cells[2] != null).map((r) => `@${r.key}[2]`);
  rows.push({ key: 'per_share', label: 'Average of available multiples', fmt: 'usd', emphasis: true, cells: [null, null, implied.length ? `=AVERAGE(${implied.join(',')})` : null] });
  return {
    id: 'multiples',
    name: 'Multiples',
    title: 'Relative valuation (multiples)',
    columns: ['Company metric', 'Peer multiple', 'Implied value per share'],
    rows,
    result: { row: 'per_share', col: 2 },
    status: implied.length ? 'ok' : 'needs-input',
    message: implied.length ? undefined : 'Enter at least one peer multiple.',
  };
}

export function scenarioSheets(a: Assumptions, baseYear: number): SheetDef[] {
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
