export type LineItem =
  | 'revenue'
  | 'cogs'
  | 'operatingIncome'
  | 'da'
  | 'interestExpense'
  | 'pretaxIncome'
  | 'taxExpense'
  | 'netIncome'
  | 'cfo'
  | 'capex'
  | 'dividendsPaid'
  | 'buybacks'
  | 'cash'
  | 'shortTermInvestments'
  | 'debt'
  | 'equity'
  | 'sharesOutstanding'
  | 'dilutedShares'
  | 'sbc'
  | 'impairments';

export interface FactValue {
  value: number;
  tag: string;
  fy: number;
  end: string;
  filed: string;
}

export interface Historicals {
  cik: string;
  name: string;
  /** Fiscal years, ascending, labelled by the calendar year of the fiscal year end. */
  years: number[];
  /** Fiscal year end dates, aligned with `years`. */
  yearEnds: string[];
  items: Partial<Record<LineItem, (FactValue | null)[]>>;
  missing: LineItem[];
  /** Most recent cover-page share count from any 10-K or 10-Q (picks up splits and buybacks after the fiscal year). */
  latestShares?: FactValue | null;
}

/** Compact companyfacts: only mapped tags, only annual 10-K rows. */
export interface TrimmedFacts {
  cik: string;
  name: string;
  tags: Record<string, TrimmedRow[]>;
}

export interface TrimmedRow {
  start?: string;
  end: string;
  val: number;
  filed: string;
  form: string;
}

export interface BetaStats {
  beta: number;
  alpha: number;
  r2: number;
  se: number;
  n: number;
  blume: number;
}

export interface SnapshotBeta extends BetaStats {
  source: 'nasdaq' | 'yahoo' | 'previous' | 'upload';
  asOf: string;
}

export interface CompanyFile {
  ticker: string;
  cik: string;
  name: string;
  sector: string;
  subIndustry: string;
  industry: string;
  facts: TrimmedFacts;
  beta: SnapshotBeta | null;
  price: { close: number; date: string } | null;
  /** Nasdaq market capitalisation, used only to catch share counts made stale by later splits or mergers. */
  marketCap?: { value: number; date: string } | null;
}

export interface IndexFile {
  asOf: string;
  companies: { ticker: string; name: string; cik: string; sector: string; subIndustry: string }[];
  failures: string[];
}

export interface IndustryRow {
  name: string;
  firms: number;
  unleveredBeta: number | null;
  pe: number | null;
  evEbitda: number | null;
  evSales: number | null;
  pb: number | null;
  peg: number | null;
}

export interface MarketFile {
  asOf: string;
  rf: number;
  rfDate: string;
  rfSource?: string;
  erp: number;
  erpSource: string;
  industries: IndustryRow[];
}

/** Plain-English names for line items, shared by the page and the Excel export. */
export const LINE_LABELS: Record<LineItem, string> = {
  revenue: 'Revenue',
  cogs: 'Cost of revenue',
  operatingIncome: 'Operating income',
  da: 'Depreciation & amortisation',
  interestExpense: 'Interest expense',
  pretaxIncome: 'Pre-tax income',
  taxExpense: 'Income tax',
  netIncome: 'Net income',
  cfo: 'Cash from operations',
  capex: 'Capital expenditure',
  dividendsPaid: 'Dividends paid',
  buybacks: 'Share buybacks',
  cash: 'Cash and equivalents',
  shortTermInvestments: 'Short-term investments',
  debt: 'Total debt',
  equity: 'Stockholders equity',
  sharesOutstanding: 'Shares outstanding',
  dilutedShares: 'Diluted shares (weighted)',
  sbc: 'Stock-based compensation',
  impairments: 'Impairments',
};
