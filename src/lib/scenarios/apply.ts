/**
 * applyScenario: base assumptions + a scenario -> new assumptions, with every shock, cap and year-by-year row compiled
 * into the per-year adjustment rows the FCFF sheet understands (Assumptions.adjust). Pure: never mutates its inputs.
 */
import { GROWTH_CAL, GROWTH_RESEARCH, type Adjust, type AdjustField, type Assumptions } from '../finance/assumptions';
import { N, HIGH } from '../finance/models';
import {
  LEVERS,
  PATH_META,
  VIRTUAL_DEFAULTS,
  isAssumptionLever,
  isLever,
  isPathLever,
  type Applied,
  type Change,
  type Lever,
  type Scenario,
  type ScenarioDiff,
  type VirtualLever,
} from './types';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const years = (f: (t: number) => number) => Array.from({ length: N + 1 }, (_, t) => (t === 0 ? 0 : f(t)));

export const NEUTRAL: Record<AdjustField, number> = {
  growthAdd: 0,
  growthSetW: 0,
  growthSetV: 0,
  growthCap: 10,
  revStep: 1,
  marginAdd: 0,
  marginSetW: 0,
  marginSetV: 0,
  capex: 0,
  rfAdd: 0,
};

/** The capex share path the base formula produces: held for five years, then faded to D&A (if capex is above it) by year 10. */
export const modelCapexPath = (a: Assumptions, high = HIGH, normal = Math.min(a.daPct, a.capexPct)) =>
  years((t) => (t <= high || high >= N ? a.capexPct : a.capexPct + (normal - a.capexPct) * ((t - high) / (N - high))));

/** The revenue growth path the FCFF sheet computes before adjustments (mirrors `fade` in models.ts). */
export function modelGrowthPath(a: Assumptions): number[] {
  const typ = a.gTypical ?? GROWTH_CAL.typical;
  return years((t) => {
    const base = typ + (a.gT - typ) * ((t - 1) / (N - 1));
    if ((a.growthMode ?? 'research') === 'research') return base + (a.g1 - typ) * Math.pow(Math.min(a.gDecay ?? GROWTH_RESEARCH.decay, 0.99), t);
    const fade = a.gFade ?? GROWTH_CAL.fade;
    const keep = a.gKeep ?? GROWTH_CAL.keep;
    const phi = Math.max(0, (fade - keep) / (1 - keep));
    return base + (a.g1 - typ) * ((N - t) / (N - 1)) * (keep + (fade - keep) * Math.pow(phi, t - 1));
  });
}

/** The operating margin path before adjustments: a straight line from today's margin to the target. */
export const modelMarginPath = (a: Assumptions) =>
  a.margin0 == null || a.marginTarget == null ? null : years((t) => a.margin0! + (a.marginTarget! - a.margin0!) * Math.min(t / a.marginYears, 1));

/** Neutral rows for the given fields: the same forecast as no adjustment at all. */
export function neutralAdjust(a: Assumptions, fields: AdjustField[]): Adjust {
  void a;
  const out: Adjust = {};
  for (const f of fields) out[f] = years(() => NEUTRAL[f]);
  return out;
}

const applyOp = (base: number, c: Change) => (c.op === 'set' ? c.value : c.op === 'add' ? base + c.value : base * c.value);

export function applyScenario(base: Assumptions, s: Pick<Scenario, 'changes' | 'paths'>): Applied {
  const a: Assumptions = { ...base, peers: { ...base.peers }, adjust: undefined };
  const v: Record<VirtualLever, number> = { ...VIRTUAL_DEFAULTS };
  const notes: string[] = [];
  const touched = new Set<Lever>();

  for (const c of s.changes) {
    if (!isLever(c.lever) || !Number.isFinite(c.value)) continue;
    const m = LEVERS[c.lever];
    if (base.financial && !m.financial) {
      notes.push(`${m.label} does not apply to banks and insurers and was skipped.`);
      continue;
    }
    if (isAssumptionLever(c.lever)) {
      const cur = a[c.lever] as number | null;
      if (cur == null) {
        notes.push(`${m.label} has no base value, so the change was skipped.`);
        continue;
      }
      let x = applyOp(cur, c);
      if (m.fmt === 'yrs') x = Math.round(x);
      // The range is widened to include the base value, so a limit can stop a change but never reverse it (a loss-maker
      // at -80% must not be lifted to -50% by a "worse margins" scenario).
      const y = clamp(x, Math.min(m.min, cur), Math.max(m.max, cur));
      if (y !== x) notes.push(`${m.label} was held at ${fmtRaw(y, m.fmt)}, the edge of its allowed range.`);
      (a as unknown as Record<string, number>)[c.lever] = y;
    } else {
      const cur = Number.isFinite(v[c.lever]) ? v[c.lever] : c.lever === 'capexNormal' ? Math.min(base.daPct, base.capexPct) : 0;
      let x = applyOp(cur, c);
      if (m.fmt === 'yrs' || m.fmt === 'flag') x = Math.round(x);
      v[c.lever] = clamp(x, m.min, m.max);
    }
    touched.add(c.lever);
  }

  // A lasting rate move reaches the cost of debt too, unless the user set the cost of debt themselves or said otherwise.
  const dRf = a.rf - base.rf;
  if (dRf !== 0 && v.rdFollowsRf && !touched.has('rd')) a.rd = clamp(base.rd + dRf, Math.min(LEVERS.rd.min, base.rd), Math.max(LEVERS.rd.max, base.rd));
  if (a.gT > a.rf) {
    notes.push(`Terminal growth was lowered to the risk-free rate (${fmtRaw(a.rf, 'pct')}): no company can outgrow the economy's safe return forever.`);
    a.gT = a.rf;
  }

  // Compile per-year adjustments (cash-flow models only).
  const adj: Adjust = {};
  const row = (f: AdjustField) => (adj[f] ??= years(() => NEUTRAL[f]));
  /** Scenario capex share by year; turned into a change from the model's path at the end, so capex_pct keeps driving it. */
  let capexPath: number[] | null = null;
  if (!base.financial) {
    const S = v.shockYear;
    if (S >= 1 && S <= N) {
      if (v.shockRevLoss > 0) {
        // Revenue level below the base path: the full loss in year S, then a share of the gap closes each year.
        const r = row('revStep');
        const level = (t: number) => (t < S ? 1 : 1 - v.shockRevLoss * Math.pow(1 - v.shockRevRecovery, t - S));
        for (let t = S; t <= N; t++) r[t] = level(t) / level(t - 1);
      }
      if (v.shockMarginDrop > 0) {
        const r = row('marginAdd');
        // The permanent part stays; the rest decays geometrically, the way profitability reverts to its mean.
        const p = v.shockPermanent;
        for (let t = S; t <= N; t++) r[t] -= v.shockMarginDrop * (p + (1 - p) * Math.pow(1 - v.shockRecovery, t - S));
      }
      if (v.shockGrowthCut !== 0) {
        const r = row('growthAdd');
        for (let t = S + 1; t <= N; t++) r[t] -= v.shockGrowthCut;
      }
    }
    if (touched.has('capexHighYears') || touched.has('capexNormal')) {
      const normal = Number.isFinite(v.capexNormal) ? v.capexNormal : Math.min(a.daPct, a.capexPct);
      capexPath = modelCapexPath(a, v.capexHighYears, normal);
    }
    if (v.growthCapYears > 0 && Number.isFinite(v.growthCap)) {
      const r = row('growthCap');
      for (let t = 1; t <= Math.min(N, v.growthCapYears); t++) r[t] = v.growthCap;
    }
  }

  // Year-by-year rows. Each year's result is held to the lever's range, for "change by" rows too.
  const gPath = modelGrowthPath(a);
  const mPath = modelMarginPath(a);
  let clamped = false;
  const within = (x: number, lo: number, hi: number) => {
    const y = clamp(x, lo, hi);
    if (y !== x) clamped = true;
    return y;
  };
  for (const p of s.paths ?? []) {
    if (!isPathLever(p.lever) || !Array.isArray(p.values)) continue;
    const pm = PATH_META[p.lever];
    if (base.financial && p.lever !== 'rf') continue;
    p.values.slice(0, N).forEach((x, i) => {
      if (x == null || !Number.isFinite(x)) return;
      const t = i + 1;
      if (p.lever === 'growth') {
        if (p.mode === 'set') {
          row('growthSetW')[t] = 1;
          row('growthSetV')[t] = within(x, pm.min, pm.max);
        } else {
          const r = row('growthAdd');
          r[t] = within(gPath[t] + r[t] + x, pm.min, pm.max) - gPath[t];
        }
      } else if (p.lever === 'margin') {
        if (p.mode === 'set') {
          row('marginSetW')[t] = 1;
          row('marginSetV')[t] = within(x, pm.min, pm.max);
        } else {
          const r = row('marginAdd');
          r[t] = mPath ? within(mPath[t] + r[t] + x, pm.min, pm.max) - mPath[t] : r[t] + x;
        }
      } else if (p.lever === 'capexPct') {
        const r = (capexPath ??= modelCapexPath(a));
        r[t] = within(p.mode === 'set' ? x : r[t] + x, pm.min, pm.max);
      } else if (p.lever === 'rf') {
        const r = row('rfAdd');
        r[t] = within(p.mode === 'set' ? x : a.rf + r[t] + x, pm.min, pm.max) - a.rf;
      }
    });
  }
  if (clamped) notes.push('Some year-by-year values were held to their allowed range.');
  if (capexPath) {
    const model = modelCapexPath(a);
    adj.capex = years((t) => capexPath![t] - model[t]);
  }
  if (base.financial && adj.rfAdd) {
    notes.push('Year-by-year rates are not modelled for banks and insurers; use the lasting risk-free rate instead.');
    delete adj.rfAdd;
  }
  if (Object.keys(adj).length) a.adjust = { ...adj, rdFollowsRf: !!v.rdFollowsRf };

  return { a, diffs: diffsOf(base, a, v, touched), notes };
}

function diffsOf(base: Assumptions, a: Assumptions, v: Record<VirtualLever, number>, touched: Set<Lever>): ScenarioDiff[] {
  const out: ScenarioDiff[] = [];
  for (const l of Object.keys(LEVERS) as Lever[]) {
    const m = LEVERS[l];
    if (isAssumptionLever(l)) {
      const b = base[l] as number | null;
      const x = a[l] as number | null;
      if (b !== x) out.push({ lever: l, label: m.label, fmt: m.fmt, base: b, value: x });
    } else if (touched.has(l)) {
      const b = VIRTUAL_DEFAULTS[l];
      out.push({ lever: l, label: m.label, fmt: m.fmt, base: Number.isFinite(b) ? b : null, value: Number.isFinite(v[l]) ? v[l] : null });
    }
  }
  return out;
}

/** Compact formatting for notes (the UI has its own). */
export function fmtRaw(x: number | null, f: string): string {
  if (x == null || !Number.isFinite(x)) return 'none';
  if (f === 'pct') return `${(x * 100).toFixed(1)}%`;
  if (f === 'x') return `${x.toFixed(1)}x`;
  if (f === 'beta') return x.toFixed(2);
  if (f === 'flag') return x ? 'yes' : 'no';
  if (f === 'shares') return `${x.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
  return String(+x.toFixed(2));
}

/** Base values of the levers a scenario changes, stored with it to notice later data refreshes. */
export function baseSnapshot(base: Assumptions, s: Pick<Scenario, 'changes'>): Partial<Record<Lever, number>> {
  const out: Partial<Record<Lever, number>> = {};
  for (const c of s.changes) if (isLever(c.lever) && isAssumptionLever(c.lever) && base[c.lever] != null) out[c.lever] = base[c.lever] as number;
  return out;
}
