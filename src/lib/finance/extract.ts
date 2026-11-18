import type { FactValue, Historicals, LineItem, TrimmedFacts, TrimmedRow } from './types';

/** Ordered fallback tags per line item. Per year, the first tag with a value wins (revenue and debt use the rules below). */
export const TAG_MAP: Record<LineItem, string[]> = {
  revenue: [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'SalesRevenueNet',
    'RevenuesNetOfInterestExpense',
    'RegulatedAndUnregulatedOperatingRevenue',
    'OperatingLeaseLeaseIncome',
  ],
  cogs: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'],
  operatingIncome: ['OperatingIncomeLoss'],
  da: [
    'DepreciationDepletionAndAmortization',
    'DepreciationAndAmortization',
    'DepreciationAmortizationAndAccretionNet',
    'Depreciation',
  ],
  interestExpense: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestPaidNet'],
  pretaxIncome: [
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  ],
  taxExpense: ['IncomeTaxExpenseBenefit'],
  // Per-share value needs income to common shareholders: after preferred dividends (Microchip) and redeemable
  // minority-interest adjustments (Live Nation). ProfitLoss includes minority interests, so it comes last.
  netIncome: ['NetIncomeLossAvailableToCommonStockholdersBasic', 'NetIncomeLoss', 'ProfitLoss'],
  cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  dividendsPaid: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'],
  buybacks: ['PaymentsForRepurchaseOfCommonStock'],
  cash: [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    'CashAndDueFromBanks',
  ],
  shortTermInvestments: [
    'MarketableSecuritiesCurrent',
    'AvailableForSaleSecuritiesDebtSecuritiesCurrent',
    'ShortTermInvestments',
    'AvailableForSaleSecuritiesDebtSecurities',
  ],
  debt: [],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  sharesOutstanding: ['dei:EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding'],
  dilutedShares: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
  sbc: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'],
  impairments: [],
  // Cash paid for acquisitions, for the "where the cash went" chart.
  acquisitions: ['PaymentsToAcquireBusinessesNetOfCashAcquired', 'PaymentsToAcquireBusinessesGross'],
};

/**
 * Some filers (AMD, Microsoft, Alphabet, Broadcom...) report only `Depreciation` and book intangible
 * amortization on its own line. When D&A falls back to `Depreciation`, the amortization is added so
 * acquisition-heavy companies do not lose billions of non-cash add-backs.
 */
const AMORT_TAGS = ['AmortizationOfIntangibleAssets', 'AdjustmentForAmortization'];

/**
 * Total debt. Filers split debt across many tags, so each recipe below adds up one set of balance-sheet lines.
 * Two guards stop double counting: the same amount under two tags in one recipe counts once (AMD tags its $874M
 * current debt as both current long-term debt and short-term borrowings), and a "long-term" tag that equals the
 * including-current-maturities total is treated as a total (Chevron). The largest remaining recipe is used, since
 * the usual failure is a recipe that misses a line. Operating leases are excluded throughout.
 */
const STB = ['ShortTermBorrowings', 'CommercialPaper'];
const LTD_TOTAL = 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities';
const DEBT_RECIPES: string[][] = [
  [LTD_TOTAL, 'ShortTermBorrowings'],
  ['LongTermDebt', ...STB],
  ['LongTermDebtCurrent', 'LongTermDebtNoncurrent', ...STB],
  ['DebtCurrent', 'LongTermDebtNoncurrent'],
  ['LongTermDebtAndCapitalLeaseObligationsCurrent', 'LongTermDebtAndCapitalLeaseObligations', ...STB],
  ['DebtCurrent', 'LongTermDebtAndCapitalLeaseObligations'],
  ['DebtAndCapitalLeaseObligations'],
  ['DebtLongtermAndShorttermCombinedAmount'],
  ['DebtInstrumentCarryingAmount'],
  ['ConvertibleNotesPayableCurrent', 'ConvertibleLongTermNotesPayable', ...STB],
  ['NotesPayableCurrent', 'LongTermNotesPayable', ...STB],
  ['SeniorLongTermNotes', ...STB],
  ['SecuredDebt', 'UnsecuredDebt'],
  ['OtherLongTermDebtCurrent', 'OtherLongTermDebtNoncurrent', 'SecuredDebtCurrent', ...STB],
  ['UnsecuredLongTermDebt', 'SecuredLongTermDebt', ...STB],
  // REITs and homebuilders: notes, bank loans and credit lines as separate lines.
  ['NotesPayable', 'LoansPayable', 'LineOfCredit', 'SecuredDebt'],
  ['SeniorNotes', 'SecuredDebt', 'LineOfCredit', ...STB],
];
const DEBT_TAGS = [...new Set(DEBT_RECIPES.flat())];

/** Balance-sheet style items take the value at fiscal year end; the rest are 12-month flows. */
const INSTANT: Set<LineItem> = new Set(['cash', 'shortTermInvestments', 'debt', 'equity', 'sharesOutstanding']);

/** Used to rebuild pre-tax and operating income when a filer reports no subtotal. */
const PRETAX_PARTS = ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign'];
const NONOP_TAGS = ['NonoperatingIncomeExpense', 'OtherNonoperatingIncomeExpense', 'InvestmentIncomeInterest', 'InvestmentIncomeInterestAndDividend'];

/** Oil and gas producers put most capex on these lines; they add to plant-and-equipment capex (acquisitions excluded). */
const EP_CAPEX = ['PaymentsToExploreAndDevelopOilAndGasProperties', 'PaymentsToAcquireOilAndGasPropertyAndEquipment', 'PaymentsToAcquireOtherPropertyPlantAndEquipment'];

/**
 * Impairments (goodwill, intangibles, long-lived assets, oil and gas properties). Like debt, each recipe is one
 * non-overlapping set of lines and the largest wins. Equity-method impairments sit below operating income and are left out.
 */
const IMPAIRMENT_RECIPES: string[][] = [
  ['AssetImpairmentCharges'],
  ['GoodwillAndIntangibleAssetImpairment', 'ImpairmentOfLongLivedAssetsHeldForUse', 'ImpairmentOfOilAndGasProperties'],
  [
    'GoodwillImpairmentLoss',
    'ImpairmentOfIntangibleAssetsExcludingGoodwill',
    'ImpairmentOfLongLivedAssetsHeldForUse',
    'ImpairmentOfOilAndGasProperties',
    'OperatingLeaseImpairmentLoss',
  ],
];
const IMPAIRMENT_TAGS = [...new Set(IMPAIRMENT_RECIPES.flat())];

/** Kept only for the data checks in checks.ts: totals and reported per-share figures to test the extraction against. */
export const CHECK_TAGS = ['Assets', 'Liabilities', 'LiabilitiesAndStockholdersEquity', 'EarningsPerShareDiluted', 'EarningsPerShareBasic'];

const COVER_SHARES = 'dei:EntityCommonStockSharesOutstanding';
const ALL_TAGS = Array.from(
  new Set([...Object.values(TAG_MAP).flat(), ...AMORT_TAGS, ...DEBT_TAGS, ...PRETAX_PARTS, ...NONOP_TAGS, ...EP_CAPEX, ...IMPAIRMENT_TAGS, ...CHECK_TAGS]),
);

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

function isTrimmed(x: unknown): x is TrimmedFacts {
  return !!x && typeof x === 'object' && 'tags' in x;
}

/** 10-Q rows older than this (days before the newest 10-Q) are dropped: trailing twelve months a year ago needs three years. */
const QUARTERLY_WINDOW = 3 * 366 + 20;

/**
 * Reduce a full companyfacts JSON to the mapped tags: annual 10-K rows (instants, and flows of about twelve months),
 * plus, from 10-Qs of the last three years, balance-sheet instants and year-to-date flows (the longest period ending on
 * each quarter date), from which trailing-twelve-month figures are built (see extractTtm).
 */
export function trimCompanyfacts(raw: unknown): TrimmedFacts {
  if (isTrimmed(raw)) return raw;
  const j = raw as { cik: number | string; entityName: string; facts: Record<string, Record<string, { units: Record<string, any[]> }>> };
  if (!j?.facts) throw new Error('This does not look like an SEC companyfacts file.');
  const tags: Record<string, TrimmedRow[]> = {};
  for (const full of ALL_TAGS) {
    const [ns, name] = full.includes(':') ? full.split(':') : ['us-gaap', full];
    const fact = j.facts[ns]?.[name];
    if (!fact) continue;
    const unit = fact.units.USD ?? fact.units.shares ?? Object.values(fact.units)[0];
    if (!unit) continue;
    const best = new Map<string, TrimmedRow>();
    const quarterly: TrimmedRow[] = [];
    for (const r of unit) {
      if (typeof r.form !== 'string') continue;
      const row: TrimmedRow = { ...(r.start ? { start: r.start } : {}), end: r.end, val: r.val, filed: r.filed, form: r.form };
      if (r.form.startsWith('10-Q')) {
        if (!r.start || (days(r.start, r.end) >= 80 && days(r.start, r.end) <= 290)) quarterly.push(row);
        continue;
      }
      if (!r.form.startsWith('10-K')) continue;
      if (r.start) {
        const len = days(r.start, r.end);
        if (len < 350 || len > 380) continue;
      }
      // One row per period, latest filing wins.
      const key = `${r.start ?? ''}|${r.end}`;
      const prev = best.get(key);
      if (!prev || r.filed > prev.filed) best.set(key, row);
    }
    // 10-Q rows: instants, and per end date the longest flow (year to date; the three-month quarter is dropped).
    const newest = quarterly.reduce((m, r) => (r.end > m ? r.end : m), '');
    const ytd = new Map<string, TrimmedRow>();
    for (const r of quarterly) {
      // Cover-page share counts are kept for every year, as before (they date each year's share count).
      if (full !== COVER_SHARES && days(r.end, newest) > QUARTERLY_WINDOW) continue;
      const key = r.start ? `|${r.end}` : `${r.end}|i`;
      const prev = ytd.get(key);
      const len = (x: TrimmedRow) => (x.start ? days(x.start, x.end) : 0);
      if (!prev || len(r) > len(prev) + 5 || (Math.abs(len(r) - len(prev)) <= 5 && r.filed > prev.filed)) ytd.set(key, r);
    }
    const rows = [...best.values(), ...ytd.values()].sort((a, b) => a.end.localeCompare(b.end));
    if (rows.length) tags[full] = rows;
  }
  return { cik: String(j.cik).padStart(10, '0'), name: j.entityName, tags };
}

/** Fiscal-year label: the calendar year in which the fiscal year ends (NVIDIA FY ending Jan 2025 = 2025). */
export const fyOf = (end: string) => {
  const d = new Date(end);
  // Fiscal years ending in the first days of January belong to the prior year (52/53-week calendars).
  return d.getUTCMonth() === 0 && d.getUTCDate() <= 7 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
};

export function annualValues(rows: TrimmedRow[], instant: boolean): Map<number, TrimmedRow> {
  const byYear = new Map<number, TrimmedRow>();
  for (const r of rows) {
    if (r.form.startsWith('10-Q')) continue;
    if (!instant) {
      if (!r.start) continue;
      const len = days(r.start, r.end);
      if (len < 350 || len > 380) continue;
    }
    const fy = fyOf(r.end);
    const prev = byYear.get(fy);
    // Keep the row whose end is latest in that fiscal year; ties go to the latest filing (restatements).
    if (!prev || r.end > prev.end || (r.end === prev.end && r.filed > prev.filed)) byYear.set(fy, r);
  }
  return byYear;
}

/** Instant value of a tag at an exact date (balance sheets share one date per year). */
export function at(t: TrimmedFacts, tag: string, end: string): TrimmedRow | undefined {
  let best: TrimmedRow | undefined;
  for (const r of t.tags[tag] ?? []) if (r.end === end && !r.start && r.form.startsWith('10-K') && (!best || r.filed > best.filed)) best = r;
  return best;
}

export function extractHistoricals(raw: unknown, nYears = 10): Historicals {
  const t = trimCompanyfacts(raw);
  const perItem = {} as Record<LineItem, Map<number, FactValue>>;
  const yearEnds = new Map<number, string>();

  for (const item of Object.keys(TAG_MAP) as LineItem[]) {
    const m = new Map<number, FactValue>();
    for (const tag of TAG_MAP[item]) {
      const rows = t.tags[tag];
      if (!rows) continue;
      for (const [fy, r] of annualValues(rows, INSTANT.has(item))) {
        const cur = m.get(fy);
        // Revenue: a later tag replaces an earlier one only when it is far larger, i.e. the earlier one was a component
        // (a REIT's contract revenue next to its rent). Otherwise tag order decides.
        if (cur && (item !== 'revenue' || r.val <= 1.5 * cur.value)) continue;
        m.set(fy, { value: r.val, tag, fy, end: r.end, filed: r.filed });
      }
    }
    perItem[item] = m;
  }

  // Fiscal years are anchored on revenue or net income periods (shares/cover data can lag).
  for (const anchor of ['revenue', 'netIncome', 'cfo'] as LineItem[]) {
    for (const [fy, v] of perItem[anchor]) if (!yearEnds.has(fy)) yearEnds.set(fy, v.end);
  }

  // Depreciation-only years: add intangible amortization from the same fiscal year.
  const amort = new Map<number, TrimmedRow & { tag: string }>();
  for (const tag of AMORT_TAGS) {
    for (const [fy, r] of annualValues(t.tags[tag] ?? [], false)) if (!amort.has(fy)) amort.set(fy, { ...r, tag });
  }
  // Combined D&A tags: some filers use one for a narrow figure and another for the full cash-flow line (Salesforce
  // tags $1.2B and $3.6B), so the largest wins rather than the first in the list.
  const combined = TAG_MAP.da.filter((tag) => tag !== 'Depreciation');
  for (const fy of yearEnds.keys()) {
    for (const tag of combined) {
      const r = annualValues(t.tags[tag] ?? [], false).get(fy);
      const cur = perItem.da.get(fy);
      if (r && (!cur || cur.tag === 'Depreciation' || r.val > cur.value)) perItem.da.set(fy, { value: r.val, tag, fy, end: r.end, filed: r.filed });
    }
  }
  for (const [fy, v] of perItem.da) {
    const a = amort.get(fy);
    if (!a || a.val <= 0) continue;
    // Depreciation only, or a combined tag smaller than amortization alone (Cisco's $700M next to $916M of amortization):
    // the combined tag cannot include the amortization, so add it.
    if (v.tag === 'Depreciation' || v.value < a.val) perItem.da.set(fy, { ...v, value: v.value + a.val, tag: `${v.tag} + ${a.tag}` });
  }

  const flow = (tag: string) => annualValues(t.tags[tag] ?? [], false);
  const fv = (r: TrimmedRow, tag: string, value = r.val): FactValue => ({ value, tag, fy: fyOf(r.end), end: r.end, filed: r.filed });

  // Pre-tax income: domestic + foreign when no total is tagged (Phillips 66), else net income + tax.
  const [dom, forg] = PRETAX_PARTS.map(flow);
  for (const [fy, d] of dom) {
    const f = forg.get(fy);
    if (!perItem.pretaxIncome.has(fy) && f) perItem.pretaxIncome.set(fy, fv(d, 'Pre-tax income, domestic + foreign', d.val + f.val));
  }
  for (const [fy, ni] of perItem.netIncome) {
    const tx = perItem.taxExpense.get(fy);
    if (!perItem.pretaxIncome.has(fy) && tx) perItem.pretaxIncome.set(fy, { ...ni, value: ni.value + tx.value, tag: 'Net income + income tax' });
  }

  // Operating income: many large filers (J&J, Lilly, Exxon) report no operating subtotal. Rebuild it from pre-tax income by
  // removing non-operating items: the total if tagged, else interest expense, other non-operating income and interest income.
  // Tested on 366 companies that do report operating income: within 10% for 72%, within 25% for 84%.
  const [nonop, other, intInc, intDiv] = NONOP_TAGS.map(flow);
  for (const [fy, pt] of perItem.pretaxIncome) {
    if (perItem.operatingIncome.has(fy)) continue;
    const n = nonop.get(fy);
    if (n) {
      perItem.operatingIncome.set(fy, { ...pt, value: pt.value - n.val, tag: 'Derived: pre-tax income - non-operating income (no operating subtotal reported)' });
      continue;
    }
    const ie = perItem.interestExpense.get(fy)?.value ?? 0;
    const oth = other.get(fy)?.val ?? 0;
    const ii = (intInc.get(fy) ?? intDiv.get(fy))?.val ?? 0;
    perItem.operatingIncome.set(fy, {
      ...pt,
      value: pt.value + ie - oth - ii,
      tag: 'Derived: pre-tax income + interest expense - other non-operating income (no operating subtotal reported)',
    });
  }

  // Capex for oil and gas producers: exploration and development spending on top of plant and equipment.
  const ep = EP_CAPEX.map(flow);
  for (const fy of yearEnds.keys()) {
    const parts = ep.map((m, i) => [EP_CAPEX[i], m.get(fy)] as const).filter((x): x is readonly [string, TrimmedRow] => !!x[1]);
    if (!parts.length) continue;
    const base = perItem.capex.get(fy);
    // "Productive assets" is already the total (Chevron): adding the oil and gas lines would count them twice.
    if (base?.tag === 'PaymentsToAcquireProductiveAssets') continue;
    const add = parts.reduce((s2, [, r]) => s2 + r.val, 0);
    perItem.capex.set(fy, {
      ...(base ?? fv(parts[0][1], '')),
      value: (base?.value ?? 0) + add,
      tag: [base?.tag, ...parts.map(([tag]) => tag)].filter(Boolean).join(' + '),
    });
  }

  // Impairments per year: the largest recipe.
  const impRows = new Map(IMPAIRMENT_TAGS.map((tag) => [tag, flow(tag)]));
  for (const fy of yearEnds.keys()) {
    let best: FactValue | null = null;
    for (const recipe of IMPAIRMENT_RECIPES) {
      const parts = recipe.map((tag) => [tag, impRows.get(tag)!.get(fy)] as const).filter((x): x is readonly [string, TrimmedRow] => !!x[1]);
      if (!parts.length) continue;
      const value = parts.reduce((s2, [, r]) => s2 + r.val, 0);
      if (!best || value > best.value) best = { ...fv(parts[0][1], ''), value, tag: parts.map(([tag]) => tag).join(' + ') };
    }
    if (best) perItem.impairments.set(fy, best);
  }

  // Total debt at each fiscal year end: the largest of the recipes.
  for (const [fy, end] of yearEnds) {
    let best: FactValue | null = null;
    const total = at(t, LTD_TOTAL, end)?.val;
    for (const recipe of DEBT_RECIPES) {
      const seen = new Set<number>();
      const rows = recipe
        .map((tag) => [tag, at(t, tag, end)] as const)
        .filter((x): x is readonly [string, TrimmedRow] => !!x[1])
        .filter(([, r]) => (seen.has(r.val) ? false : (seen.add(r.val), true)));
      if (!rows.some(([tag]) => !STB.includes(tag))) continue;
      // A "noncurrent" tag that equals the total already includes the current part: the total recipe covers it.
      if (total != null && recipe[0] !== LTD_TOTAL && rows.some(([tag, r]) => tag === 'LongTermDebtAndCapitalLeaseObligations' && r.val === total)) continue;
      const value = rows.reduce((s, [, r]) => s + r.val, 0);
      if (!best || value > best.value)
        best = { value, tag: rows.map(([tag]) => tag).join(' + '), fy, end, filed: rows.reduce((f, [, r]) => (r.filed > f ? r.filed : f), '') };
    }
    // Only short-term borrowings reported.
    if (!best) {
      const rows = STB.map((tag) => [tag, at(t, tag, end)] as const).filter((x): x is readonly [string, TrimmedRow] => !!x[1]);
      if (rows.length) best = { value: rows.reduce((s, [, r]) => s + r.val, 0), tag: rows.map(([tag]) => tag).join(' + '), fy, end, filed: rows[0][1].filed };
    }
    if (best) perItem.debt.set(fy, best);
  }

  const years = [...yearEnds.keys()].sort((a, b) => a - b).slice(-nYears);

  const items: Historicals['items'] = {};
  const missing: LineItem[] = [];
  for (const item of Object.keys(TAG_MAP) as LineItem[]) {
    const arr = years.map((y) => perItem[item].get(y) ?? null);
    // Shares on the cover page are dated after FY end; take the latest value as of each year.
    if (item === 'sharesOutstanding') {
      const all = [...perItem[item].values()].sort((a, b) => a.end.localeCompare(b.end));
      years.forEach((y, i) => {
        const end = yearEnds.get(y)!;
        const within = all.filter((v) => days(end, v.end) >= -10 && days(end, v.end) <= 150);
        arr[i] = within.at(-1) ?? arr[i];
      });
    }
    items[item] = arr;
    if (arr.at(-1) == null && item !== 'impairments' && item !== 'acquisitions') missing.push(item);
  }

  // Share counts filed in the wrong scale (McDonald's files diluted shares as 711 rather than 711 million; Packaging
  // Corp files its cover count in thousands). The yardstick is the filing's own net income / diluted EPS: a count
  // more than 100x away from it is rescaled by the power of 1,000 that brings it in line.
  const epsByYear = annualValues(t.tags.EarningsPerShareDiluted ?? [], false);
  const niAny = (fy: number) => perItem.netIncome.get(fy)?.value;
  const impliedShares = (fy: number) => {
    const e = epsByYear.get(fy)?.val;
    const n = niAny(fy);
    return e != null && n != null && Math.abs(e) >= 0.05 ? Math.abs(n / e) : null;
  };
  const rescale = (v: FactValue | null | undefined, ref: number | null): FactValue | null => {
    if (!v || !ref || (v.value > ref / 100 && v.value < ref * 100)) return v ?? null;
    for (const k of [1e3, 1e6, 1e-3, 1e-6]) {
      const x = v.value * k;
      if (x > ref * 0.5 && x < ref * 2) return { ...v, value: x, tag: `${v.tag} (filed ${k > 1 ? `${k}x too small` : `${1 / k}x too large`}, rescaled)` };
    }
    return v;
  };
  items.dilutedShares = items.dilutedShares?.map((v, i) => rescale(v, impliedShares(years[i])));
  items.sharesOutstanding = items.sharesOutstanding?.map((v, i) => rescale(v, impliedShares(years[i])));

  // Net income: of the candidate tags, take the one that reproduces the diluted EPS the company reports. Income to
  // common (after preferred dividends) is usually right, but some filers mis-scale it (Packaging Corp), so the
  // filing's own EPS decides. Without EPS, tag order decides.
  const epsRows = annualValues(t.tags.EarningsPerShareDiluted ?? [], false);
  const niRows = TAG_MAP.netIncome.map((tag) => [tag, annualValues(t.tags[tag] ?? [], false)] as const);
  items.netIncome = items.netIncome?.map((v, i) => {
    const fy = years[i];
    const eps = epsRows.get(fy)?.val;
    const dil = items.dilutedShares?.[i]?.value;
    if (!v || eps == null || !dil || Math.abs(eps) < 0.05) return v;
    let best = v;
    let bestGap = Math.abs(v.value / dil - eps);
    for (const [tag, rows] of niRows) {
      const r = rows.get(fy);
      if (!r) continue;
      const gap = Math.abs(r.val / dil - eps);
      if (gap < bestGap - 0.005) {
        best = { value: r.val, tag, fy, end: r.end, filed: r.filed };
        bestGap = gap;
      }
    }
    return best;
  });

  // Latest cover-page share count from any 10-K or 10-Q, so splits and buybacks after the fiscal year are reflected.
  const cover = (t.tags[COVER_SHARES] ?? []).filter((r) => !r.start).sort((a, b) => a.end.localeCompare(b.end) || a.filed.localeCompare(b.filed));
  const lastCover = cover.at(-1);
  const fyEnd = years.length ? yearEnds.get(years.at(-1)!)! : null;
  const latestShares = rescale(
    lastCover && fyEnd && days(fyEnd, lastCover.end) > -30
      ? { value: lastCover.val, tag: `${COVER_SHARES} (${lastCover.form} cover, ${lastCover.end})`, fy: fyOf(lastCover.end), end: lastCover.end, filed: lastCover.filed }
      : null,
    years.length ? impliedShares(years.at(-1)!) : null,
  );

  const yearEndList = years.map((y) => yearEnds.get(y)!);
  const ttm = extractTtm(t, yearEndList, items);
  const fyEnd2 = yearEndList.at(-1);
  const qEnd = !ttm && fyEnd2 ? latestQuarterEnd(t, fyEnd2) : null;
  const ttmSkipped = qEnd && fyEnd2 ? ttmBasisProblem(t, fyEnd2, qEnd) : null;
  return { cik: t.cik, name: t.name, years, yearEnds: yearEndList, items, missing, latestShares, ttm, ttmSkipped };
}

const near = (a: string, b: string, tol = 10) => Math.abs(days(a, b)) <= tol;
const shiftYears = (d: string, n: number) => {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() + n);
  return x.toISOString().slice(0, 10);
};
const nextDay = (d: string) => new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10);
/** Weighted-average share counts are averages, not sums: the year-to-date figure stands for the period as it is. */
const AVERAGE_TAGS = new Set(['WeightedAverageNumberOfDilutedSharesOutstanding']);

/** The 10-Q year-to-date row for the fiscal year after `fyEnd`, ending near `end`. */
function ytdRow(rows: TrimmedRow[], fyEnd: string, end: string): TrimmedRow | undefined {
  let best: TrimmedRow | undefined;
  for (const r of rows)
    if (r.form.startsWith('10-Q') && r.start && near(r.start, nextDay(fyEnd)) && near(r.end, end) && (!best || r.filed > best.filed)) best = r;
  return best;
}

/**
 * Trailing-twelve-month facts for the year to `end`, rolled forward from the 10-K for the year to `fyEnd`:
 * last fiscal year + year to date now - the same period a year earlier. Balance-sheet items are the 10-Q values at `end`.
 * Rows come out shaped like 10-K rows, so extractHistoricals applies every annual rule (debt recipes, rebuilt operating
 * income, D&A plus amortisation, net income chosen by EPS) to the trailing period too.
 */
function rollForward(t: TrimmedFacts, fyEnd: string, end: string, out: Record<string, TrimmedRow[]>): void {
  const priorFyEnd = shiftYears(fyEnd, -1);
  for (const [tag, rows] of Object.entries(t.tags)) {
    if (tag === COVER_SHARES) continue;
    const q = ytdRow(rows, fyEnd, end);
    if (q) {
      let val = q.val;
      if (!AVERAGE_TAGS.has(tag)) {
        const fy = rows.find((r) => r.form.startsWith('10-K') && r.start && near(r.end, fyEnd) && days(r.start, r.end) >= 350);
        const prior = ytdRow(rows, priorFyEnd, shiftYears(q.end, -1));
        if (!fy || !prior) continue;
        val = fy.val + q.val - prior.val;
      }
      (out[tag] ??= []).push({ start: nextDay(shiftYears(end, -1)), end, val, filed: q.filed, form: '10-K' });
      continue;
    }
    const inst = rows.filter((r) => !r.start && r.end === end).sort((a, b) => b.filed.localeCompare(a.filed))[0];
    if (inst) (out[tag] ??= []).push({ end, val: inst.val, filed: inst.filed, form: '10-K' });
  }
}

const TTM_ANCHORS = [...TAG_MAP.revenue, ...TAG_MAP.netIncome, ...TAG_MAP.cfo];

/**
 * Trailing twelve months to the latest 10-Q, plus the same window a year earlier (for growth). Null when the latest
 * filing is the 10-K itself, when the 10-Q data needed is missing (older trimmed files, unusual fiscal calendars), or
 * when the result looks like a data error (revenue under 40% or over 250% of the last fiscal year).
 */
/** End of the latest 10-Q year-to-date period after the fiscal year ending `fyEnd`, or null. */
function latestQuarterEnd(t: TrimmedFacts, fyEnd: string): string | null {
  let end: string | null = null;
  for (const tag of TTM_ANCHORS) {
    const q = (t.tags[tag] ?? []).filter((r) => r.form.startsWith('10-Q') && r.start && near(r.start, nextDay(fyEnd)) && r.end > fyEnd);
    for (const r of q) if (!end || r.end > end) end = r.end;
  }
  return end;
}

/**
 * Rolling a 10-K forward is only sound when the 10-Q reports on the same basis. After a spin-off or sale the 10-Q
 * restates earlier periods to continuing operations (Honeywell: nine months of 2025 fell from $28B to $15B), and adding
 * that to the old 10-K would mix two different companies. The test: the share of a fiscal year's revenue earned by the
 * same quarter date (year-to-date / full year, both for the year ending `fyEnd`) must match the share a year earlier
 * within 10 points, and lie within half to one and a half times the share of the year elapsed. Returns why it fails.
 */
export function ttmBasisProblem(t: TrimmedFacts, fyEnd: string, end: string): string | null {
  const priorFyEnd = shiftYears(fyEnd, -1);
  for (const tag of TAG_MAP.revenue) {
    const rows = t.tags[tag] ?? [];
    const q = ytdRow(rows, fyEnd, end);
    if (!q) continue;
    const annualAt = (e: string) => rows.find((r) => r.form.startsWith('10-K') && r.start && near(r.end, e) && days(r.start, r.end) >= 350);
    const fy = annualAt(fyEnd);
    const ytdPrior = ytdRow(rows, priorFyEnd, shiftYears(q.end, -1));
    if (!fy || !ytdPrior || fy.val <= 0) return null;
    const elapsed = days(q.start!, q.end) / 365;
    const share = ytdPrior.val / fy.val;
    const earlierFy = annualAt(priorFyEnd);
    const ytdEarlier = ytdRow(rows, shiftYears(priorFyEnd, -1), shiftYears(q.end, -2));
    const shareEarlier = earlierFy && ytdEarlier && earlierFy.val > 0 ? ytdEarlier.val / earlierFy.val : null;
    if (share < 0.5 * elapsed || share > 1.5 * elapsed || (shareEarlier != null && Math.abs(share - shareEarlier) > 0.1))
      return `The 10-Q to ${end} restates earlier periods (a spin-off, sale or change in reporting): its figures for the year before no longer match the 10-K, so the trailing twelve months cannot be built from both.`;
    return null;
  }
  return null;
}

export function extractTtm(t: TrimmedFacts, yearEnds: string[], annual: Historicals['items']): Historicals['ttm'] {
  const fyEnd = yearEnds.at(-1);
  if (!fyEnd) return null;
  const end = latestQuarterEnd(t, fyEnd);
  if (!end || ttmBasisProblem(t, fyEnd, end)) return null;
  const synth: Record<string, TrimmedRow[]> = {};
  rollForward(t, fyEnd, end, synth);
  const priorEnd = yearEnds.at(-2);
  const priorTtmEnd = shiftYears(end, -1);
  if (priorEnd) {
    // The prior-year window ends on that year's quarter date, which can differ by a few days on 52/53-week calendars.
    const priorRow = TTM_ANCHORS.flatMap((tag) => t.tags[tag] ?? []).find((r) => r.form.startsWith('10-Q') && r.start && near(r.start, nextDay(priorEnd)) && near(r.end, priorTtmEnd));
    // The window a year earlier needs the same basis check; without it, growth falls back to fiscal years.
    if (priorRow && !ttmBasisProblem(t, priorEnd, priorRow.end)) rollForward(t, priorEnd, priorRow.end, synth);
  }
  for (const rows of Object.values(synth)) rows.sort((a, b) => a.end.localeCompare(b.end));
  const h = extractHistoricals({ cik: t.cik, name: t.name, tags: synth }, 2);
  if (h.years.at(-1) !== fyOf(end) || h.yearEnds.at(-1) !== end) return null;
  const pick = (i: number) => {
    const out: Partial<Record<LineItem, FactValue | null>> = {};
    for (const k of Object.keys(TAG_MAP) as LineItem[]) {
      const v = h.items[k]?.[i];
      const how = INSTANT.has(k) ? `10-Q balance sheet, ${v?.end}` : 'last 12 months (10-K + 10-Q year to date - same period a year earlier)';
      out[k] = v ? { ...v, tag: `${v.tag}, ${how}` } : null;
    }
    return out;
  };
  const items = pick(h.years.length - 1);
  const prior = h.years.length === 2 && near(h.yearEnds[0], priorTtmEnd) ? pick(0) : null;
  const rev = items.revenue?.value;
  const revFy = annual.revenue?.at(-1)?.value;
  if (rev != null && revFy && (rev / revFy < 0.4 || rev / revFy > 2.5)) return null;
  // The headline lines must all roll forward, or the trailing period would mix windows: fall back to the fiscal year.
  for (const k of ['revenue', 'netIncome', 'operatingIncome'] as LineItem[]) if (annual[k]?.at(-1) != null && items[k] == null) return null;
  if (items.revenue == null && items.netIncome == null) return null;
  return { start: nextDay(shiftYears(end, -1)), end, fyEnd, items, prior };
}

/** Value of an item in the latest fiscal year, or null. Older years never stand in: a stale figure is worse than a gap. */
export function latest(h: Historicals, item: LineItem): number | null {
  return h.items[item]?.at(-1)?.value ?? null;
}

/** Which period the model starts from: the trailing twelve months (default when 10-Q data exist) or the last fiscal year. */
export type Basis = 'ttm' | 'fy';

/** Latest figure on the chosen basis: trailing twelve months when available, else the last fiscal year. */
export function current(h: Historicals, item: LineItem, basis: Basis = 'ttm'): number | null {
  return currentFact(h, item, basis)?.value ?? null;
}

export function currentFact(h: Historicals, item: LineItem, basis: Basis = 'ttm'): FactValue | null {
  const fy = h.items[item]?.at(-1) ?? null;
  if (basis !== 'ttm' || !h.ttm) return fy;
  // A line the 10-Qs do not tag (debt under a recipe only the 10-K uses, D&A at some filers) keeps its 10-K value
  // rather than reading as zero.
  const t = h.ttm.items[item];
  return t ?? (fy ? { ...fy, tag: `${fy.tag} (latest 10-K: not tagged in the 10-Qs)` } : null);
}
