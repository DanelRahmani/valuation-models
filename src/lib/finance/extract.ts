import type { FactValue, Historicals, LineItem, TrimmedFacts, TrimmedRow } from './types';

/** Ordered fallback tags per line item. Per year, the first tag with a value wins. */
export const TAG_MAP: Record<LineItem, string[]> = {
  revenue: [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'SalesRevenueNet',
    'RevenuesNetOfInterestExpense',
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
  netIncome: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
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
  debtCurrent: ['LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings', 'CommercialPaper'],
  debtNoncurrent: ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  sharesOutstanding: ['dei:EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding'],
  dilutedShares: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
  sbc: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'],
};

/** Balance-sheet style items take the value at fiscal year end; the rest are 12-month flows. */
const INSTANT: Set<LineItem> = new Set([
  'cash',
  'shortTermInvestments',
  'debtCurrent',
  'debtNoncurrent',
  'equity',
  'sharesOutstanding',
]);

const ALL_TAGS = Array.from(new Set(Object.values(TAG_MAP).flat()));

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

function isTrimmed(x: unknown): x is TrimmedFacts {
  return !!x && typeof x === 'object' && 'tags' in x;
}

/** Reduce a full companyfacts JSON to the mapped tags, annual 10-K rows only. */
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
    // Keep annual 10-K rows only: instants, or flows of roughly twelve months. One row per period, latest filing wins.
    const best = new Map<string, TrimmedRow>();
    for (const r of unit) {
      if (typeof r.form !== 'string' || !r.form.startsWith('10-K')) continue;
      if (r.start) {
        const len = days(r.start, r.end);
        if (len < 350 || len > 380) continue;
      }
      const key = `${r.start ?? ''}|${r.end}`;
      const prev = best.get(key);
      if (!prev || r.filed > prev.filed) best.set(key, { ...(r.start ? { start: r.start } : {}), end: r.end, val: r.val, filed: r.filed, form: r.form });
    }
    const rows = [...best.values()].sort((a, b) => a.end.localeCompare(b.end));
    if (rows.length) tags[full] = rows;
  }
  return { cik: String(j.cik).padStart(10, '0'), name: j.entityName, tags };
}

/** Fiscal-year label: the calendar year in which the fiscal year ends (NVIDIA FY ending Jan 2025 = 2025). */
const fyOf = (end: string) => {
  const d = new Date(end);
  // Fiscal years ending in the first days of January belong to the prior year (52/53-week calendars).
  return d.getUTCMonth() === 0 && d.getUTCDate() <= 7 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
};

function annualValues(rows: TrimmedRow[], instant: boolean): Map<number, TrimmedRow> {
  const byYear = new Map<number, TrimmedRow>();
  for (const r of rows) {
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
        if (m.has(fy)) continue; // an earlier tag in the list wins for this year
        m.set(fy, { value: r.val, tag, fy, end: r.end, filed: r.filed });
      }
    }
    perItem[item] = m;
  }

  // Fiscal years are anchored on revenue or net income periods (shares/cover data can lag).
  for (const anchor of ['revenue', 'netIncome', 'cfo'] as LineItem[]) {
    for (const [fy, v] of perItem[anchor]) if (!yearEnds.has(fy)) yearEnds.set(fy, v.end);
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
    if (arr.at(-1) == null) missing.push(item);
  }

  return { cik: t.cik, name: t.name, years, yearEnds: years.map((y) => yearEnds.get(y)!), items, missing };
}

/** Latest non-null value of an item, or null. */
export function latest(h: Historicals, item: LineItem): number | null {
  const arr = h.items[item];
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i]) return arr[i]!.value;
  return null;
}
