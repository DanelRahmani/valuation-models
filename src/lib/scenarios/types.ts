/**
 * Scenarios: named what-ifs on top of the base case, saved in the browser. A scenario is data only, a list of changes to
 * a fixed set of levers, never code or formulas, so nothing a user types is ever run.
 */
import type { Assumptions } from '../finance/assumptions';

/** Levers that are plain assumptions. */
export type AssumptionLever =
  | 'g1'
  | 'gDecay'
  | 'gTypical'
  | 'gT'
  | 'marginTarget'
  | 'marginYears'
  | 'capexPct'
  | 'daPct'
  | 'nwcPct'
  | 'beta'
  | 'erp'
  | 'rd'
  | 'rf'
  | 'exitMultiple'
  | 'tax';

/** Levers that only exist in scenarios and compile to per-year adjustments. */
export type VirtualLever =
  | 'shockYear'
  | 'shockRevLoss'
  | 'shockMarginDrop'
  | 'shockRecovery'
  | 'shockGrowthCut'
  | 'capexHighYears'
  | 'capexNormal'
  | 'growthCap'
  | 'growthCapYears'
  | 'rdFollowsRf';

export type Lever = AssumptionLever | VirtualLever;
export type Op = 'set' | 'add' | 'scale';

export interface Change {
  lever: Lever;
  op: Op;
  value: number;
}

/** Year-by-year rows (advanced). values[0] = year 1; null = keep the model's own value for that year. */
export type PathLever = 'growth' | 'margin' | 'capexPct' | 'rf';
export interface PathChange {
  lever: PathLever;
  mode: 'set' | 'add';
  values: (number | null)[];
}

export interface Scenario {
  id: string;
  name: string;
  /** The story behind the numbers, in a line or two. */
  story: string;
  changes: Change[];
  paths?: PathChange[];
  templateId?: string;
  createdAt: string;
  updatedAt: string;
  /** Base values of the changed levers when last saved, to flag a data refresh that moved them. */
  baseAtSave?: Partial<Record<Lever, number>>;
}

export type LeverFmt = 'pct' | 'num' | 'x' | 'beta' | 'yrs' | 'flag';

export interface LeverMeta {
  label: string;
  group: 'Growth' | 'Margins' | 'New-entrant shock' | 'Reinvestment' | 'Capacity' | 'Rates' | 'Risk and end value';
  fmt: LeverFmt;
  /** The operation the editor offers first. */
  op: Op;
  min: number;
  max: number;
  /** Shown for banks and insurers (valued on book equity, without cash-flow levers). */
  financial: boolean;
  help?: string;
}

export const LEVERS: Record<Lever, LeverMeta> = {
  g1: { label: 'Revenue growth, latest year', group: 'Growth', fmt: 'pct', op: 'scale', min: -0.5, max: 1.5, financial: true, help: 'Where the forecast starts; it then fades.' },
  gDecay: { label: 'Excess growth kept each year', group: 'Growth', fmt: 'pct', op: 'add', min: 0, max: 0.99, financial: false, help: 'Lower = a boom fades faster. 70% halves the gap every two years.' },
  gTypical: { label: 'Typical company growth', group: 'Growth', fmt: 'pct', op: 'add', min: -0.05, max: 0.2, financial: false },
  gT: { label: 'Terminal growth', group: 'Growth', fmt: 'pct', op: 'add', min: -0.02, max: 0.05, financial: true, help: 'Capped at the risk-free rate.' },
  marginTarget: { label: 'Operating margin, target', group: 'Margins', fmt: 'pct', op: 'add', min: -0.5, max: 0.9, financial: false },
  marginYears: { label: 'Years to reach target margin', group: 'Margins', fmt: 'yrs', op: 'set', min: 1, max: 10, financial: false },
  shockYear: { label: 'Shock year (0 = none)', group: 'New-entrant shock', fmt: 'yrs', op: 'set', min: 0, max: 10, financial: false, help: 'The year a rival product takes off.' },
  shockRevLoss: { label: 'Revenue lost in the shock year', group: 'New-entrant shock', fmt: 'pct', op: 'set', min: 0, max: 0.9, financial: false, help: 'A one-time drop in revenue level; growth carries on from there.' },
  shockMarginDrop: { label: 'Margin hit', group: 'New-entrant shock', fmt: 'pct', op: 'set', min: 0, max: 0.9, financial: false, help: 'Operating margin points lost from the shock year on.' },
  shockRecovery: { label: 'Margin hit won back by year 10', group: 'New-entrant shock', fmt: 'pct', op: 'set', min: 0, max: 1, financial: false, help: '0% = permanent, 100% = fully recovered.' },
  shockGrowthCut: { label: 'Slower growth after the shock', group: 'New-entrant shock', fmt: 'pct', op: 'set', min: -0.2, max: 0.5, financial: false, help: 'Points off growth every year after the shock.' },
  capexPct: { label: 'Capex, % of revenue', group: 'Reinvestment', fmt: 'pct', op: 'scale', min: 0, max: 1, financial: false },
  capexHighYears: { label: 'Years capex stays high', group: 'Reinvestment', fmt: 'yrs', op: 'set', min: 0, max: 10, financial: false, help: 'Base: 5, then it fades to normal by year 10.' },
  capexNormal: { label: 'Normal capex after that', group: 'Reinvestment', fmt: 'pct', op: 'set', min: 0, max: 1, financial: false, help: 'Base: D&A (or capex, if lower).' },
  daPct: { label: 'D&A, % of revenue', group: 'Reinvestment', fmt: 'pct', op: 'scale', min: 0, max: 1, financial: false },
  nwcPct: { label: 'Working capital per new $ of revenue', group: 'Reinvestment', fmt: 'pct', op: 'set', min: -0.5, max: 1, financial: false },
  growthCap: { label: 'Most revenue can grow per year', group: 'Capacity', fmt: 'pct', op: 'set', min: -0.5, max: 1.5, financial: false, help: 'Power, fabs or permits limit growth however much capital there is.' },
  growthCapYears: { label: 'For how many years', group: 'Capacity', fmt: 'yrs', op: 'set', min: 0, max: 10, financial: false },
  rf: { label: 'Risk-free rate (10-yr Treasury), lasting', group: 'Rates', fmt: 'pct', op: 'add', min: -0.01, max: 0.2, financial: true },
  rdFollowsRf: { label: 'Cost of debt moves with the rate (1 = yes)', group: 'Rates', fmt: 'flag', op: 'set', min: 0, max: 1, financial: true },
  rd: { label: 'Pre-tax cost of debt', group: 'Rates', fmt: 'pct', op: 'add', min: 0, max: 0.3, financial: true },
  beta: { label: 'Levered beta', group: 'Risk and end value', fmt: 'beta', op: 'add', min: 0.3, max: 3, financial: true },
  erp: { label: 'Equity risk premium', group: 'Risk and end value', fmt: 'pct', op: 'add', min: 0, max: 0.15, financial: true },
  exitMultiple: { label: 'Exit EV/EBITDA (exit method only)', group: 'Risk and end value', fmt: 'x', op: 'scale', min: 1, max: 60, financial: false },
  tax: { label: 'Tax rate', group: 'Risk and end value', fmt: 'pct', op: 'add', min: 0, max: 0.5, financial: true },
};

export const ASSUMPTION_LEVERS: AssumptionLever[] = ['g1', 'gDecay', 'gTypical', 'gT', 'marginTarget', 'marginYears', 'capexPct', 'daPct', 'nwcPct', 'beta', 'erp', 'rd', 'rf', 'exitMultiple', 'tax'];
export const isAssumptionLever = (l: Lever): l is AssumptionLever => (ASSUMPTION_LEVERS as string[]).includes(l);

/** Neutral value of each virtual lever: the base case. capexNormal and growthCap have none (NaN = not set). */
export const VIRTUAL_DEFAULTS: Record<VirtualLever, number> = {
  shockYear: 0,
  shockRevLoss: 0,
  shockMarginDrop: 0,
  shockRecovery: 0,
  shockGrowthCut: 0,
  capexHighYears: 5,
  capexNormal: NaN,
  growthCap: NaN,
  growthCapYears: 0,
  rdFollowsRf: 1,
};

export const PATH_META: Record<PathLever, { label: string; min: number; max: number }> = {
  growth: { label: 'Revenue growth', min: -0.9, max: 3 },
  margin: { label: 'Operating margin', min: -0.5, max: 0.9 },
  capexPct: { label: 'Capex, % of revenue', min: 0, max: 1 },
  rf: { label: 'Risk-free rate', min: -0.01, max: 0.25 },
};

export interface ScenarioDiff {
  lever: Lever;
  label: string;
  fmt: LeverFmt;
  base: number | null;
  value: number | null;
}

export interface Applied {
  a: Assumptions;
  diffs: ScenarioDiff[];
  /** Plain-language notes: clamps hit, terminal growth capped, levers that do not apply. */
  notes: string[];
}
