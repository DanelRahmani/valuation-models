/**
 * Shareable links: the ticker, the beta choice, the view and every assumption that differs from its default go
 * into the URL, so a link reopens exactly the scenario on screen. Only scalar assumptions are encoded.
 */
import type { Assumptions } from './finance/assumptions';

export type BetaChoice = 'regression' | 'blume' | 'industry' | 'manual' | 'upload';

/** URL key for each shareable assumption. Short and stable: changing one breaks old links. */
export const SHARE_KEYS = {
  price: 'px',
  rf: 'rf',
  erp: 'erp',
  beta: 'b',
  rd: 'rd',
  tax: 'tax',
  g1: 'g1',
  gT: 'gt',
  marginTarget: 'm',
  marginYears: 'my',
  daPct: 'da',
  capexPct: 'cx',
  nwcPct: 'wc',
  exitMultiple: 'xm',
  roe: 'roe',
  gTypical: 'gty',
  gDecay: 'gd',
  gFade: 'gf',
  gKeep: 'gk',
} as const satisfies Partial<Record<keyof Assumptions, string>>;

type NumKey = keyof typeof SHARE_KEYS;
const BETA_CHOICES: BetaChoice[] = ['regression', 'blume', 'industry', 'manual', 'upload'];

export interface ShareState {
  ticker: string;
  beta?: BetaChoice;
  simple?: boolean;
  terminal?: 'gordon' | 'exit';
  growth?: 'research' | 'base';
  /** Assumption overrides. */
  over: Partial<Record<NumKey, number | null>>;
}

const same = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/** Trim to 6 significant digits so links stay short and round-trip exactly enough. */
const enc = (x: number | null) => (x == null ? '' : String(Number(x.toPrecision(6))));

export function encodeShare(s: { ticker: string; beta: BetaChoice; defaultBeta: BetaChoice; simple: boolean; a: Assumptions; defaults: Assumptions }): string {
  const p = new URLSearchParams();
  p.set('t', s.ticker);
  if (s.beta !== s.defaultBeta && s.beta !== 'upload') p.set('beta', s.beta);
  if (s.simple) p.set('view', 'simple');
  if (s.a.terminalMethod !== s.defaults.terminalMethod) p.set('tv', s.a.terminalMethod);
  if ((s.a.growthMode ?? 'research') !== (s.defaults.growthMode ?? 'research')) p.set('gm', s.a.growthMode ?? 'research');
  for (const [k, short] of Object.entries(SHARE_KEYS) as [NumKey, string][]) {
    // A beta that follows the chosen method is restored from the method; only a typed beta is encoded.
    if (k === 'beta' && s.beta !== 'manual') continue;
    const v = s.a[k] as number | null;
    if (!same(v, s.defaults[k] as number | null)) p.set(short, enc(v));
  }
  return p.toString();
}

export function decodeShare(search: string | URLSearchParams): ShareState {
  const p = typeof search === 'string' ? new URLSearchParams(search) : search;
  const out: ShareState = { ticker: (p.get('t') ?? '').toUpperCase(), over: {} };
  const beta = p.get('beta') as BetaChoice | null;
  if (beta && BETA_CHOICES.includes(beta)) out.beta = beta;
  if (p.get('view') === 'simple') out.simple = true;
  const tv = p.get('tv');
  if (tv === 'gordon' || tv === 'exit') out.terminal = tv;
  const gm = p.get('gm');
  if (gm === 'research' || gm === 'base') out.growth = gm;
  for (const [k, short] of Object.entries(SHARE_KEYS) as [NumKey, string][]) {
    if (!p.has(short)) continue;
    const raw = p.get(short)!;
    const n = raw === '' ? null : Number(raw);
    if (n === null || Number.isFinite(n)) out.over[k] = n;
  }
  if (out.over.beta != null && !out.beta) out.beta = 'manual';
  return out;
}

/** Apply decoded overrides to default assumptions. */
export function applyShare(a: Assumptions, s: ShareState): Assumptions {
  const next = { ...a } as Assumptions;
  for (const [k, v] of Object.entries(s.over) as [NumKey, number | null][]) (next as unknown as Record<string, unknown>)[k] = v;
  if (s.terminal) next.terminalMethod = s.terminal;
  if (s.growth) next.growthMode = s.growth;
  return next;
}
