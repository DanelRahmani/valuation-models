/**
 * applyScenario: base assumptions + a scenario -> new assumptions, with every shock, cap and year-by-year row compiled
 * into the per-year adjustment rows the FCFF sheet understands (Assumptions.adjust). Pure: never mutates its inputs.
 */
import type { Adjust, AdjustField, Assumptions } from '../finance/assumptions';
import { N, HIGH } from '../finance/models';
import {
  LEVERS,
  PATH_META,
  VIRTUAL_DEFAULTS,
  isAssumptionLever,
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
  capex: 0, // replaced by the model's own path, see modelCapexPath
  rfAdd: 0,
};

/** The capex path the base formula produces: held for five years, then faded to D&A (if capex is above it) by year 10. */
export const modelCapexPath = (a: Assumptions, high = HIGH, normal = Math.min(a.daPct, a.capexPct)) =>
  years((t) => (t <= high || high >= N ? a.capexPct : a.capexPct + (normal - a.capexPct) * ((t - high) / (N - high))));

/** Neutral rows for the given fields: the same forecast as no adjustment at all. */
export function neutralAdjust(a: Assumptions, fields: AdjustField[]): Adjust {
  const out: Adjust = {};
  for (const f of fields) out[f] = f === 'capex' ? modelCapexPath(a) : years(() => NEUTRAL[f]);
  return out;
}

const applyOp = (base: number, c: Change) => (c.op === 'set' ? c.value : c.op === 'add' ? base + c.value : base * c.value);

export function applyScenario(base: Assumptions, s: Pick<Scenario, 'changes' | 'paths'>): Applied {
  const a: Assumptions = { ...base, peers: { ...base.peers }, adjust: undefined };
  const v: Record<VirtualLever, number> = { ...VIRTUAL_DEFAULTS };
  const notes: string[] = [];
  const touched = new Set<Lever>();

  for (const c of s.changes) {
    const m = LEVERS[c.lever];
    if (!m || !Number.isFinite(c.value)) continue;
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
      const y = clamp(x, m.min, m.max);
      if (y !== x) notes.push(`${m.label} was held to the range ${fmtRaw(m.min, m.fmt)} to ${fmtRaw(m.max, m.fmt)}.`);
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
  if (dRf !== 0 && v.rdFollowsRf && !touched.has('rd')) a.rd = clamp(base.rd + dRf, LEVERS.rd.min, LEVERS.rd.max);
  if (a.gT > a.rf) {
    notes.push(`Terminal growth was lowered to the risk-free rate (${fmtRaw(a.rf, 'pct')}): no company can outgrow the economy's safe return forever.`);
    a.gT = a.rf;
  }

  // Compile per-year adjustments (cash-flow models only).
  const adj: Adjust = {};
  const row = (f: AdjustField) => (adj[f] ??= years(() => NEUTRAL[f]));
  if (!base.financial) {
    const S = v.shockYear;
    if (S >= 1 && S <= N) {
      if (v.shockRevLoss > 0) row('revStep')[S] = 1 - v.shockRevLoss;
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
      adj.capex = modelCapexPath(a, v.capexHighYears, normal);
    }
    if (v.growthCapYears > 0 && Number.isFinite(v.growthCap)) {
      const r = row('growthCap');
      for (let t = 1; t <= Math.min(N, v.growthCapYears); t++) r[t] = v.growthCap;
    }
  }

  for (const p of s.paths ?? []) {
    const pm = PATH_META[p.lever];
    if (!pm) continue;
    if (base.financial && p.lever !== 'rf') continue;
    p.values.slice(0, N).forEach((x, i) => {
      if (x == null || !Number.isFinite(x)) return;
      const t = i + 1;
      if (p.lever === 'growth') {
        if (p.mode === 'set') {
          row('growthSetW')[t] = 1;
          row('growthSetV')[t] = clamp(x, pm.min, pm.max);
        } else row('growthAdd')[t] += x;
      } else if (p.lever === 'margin') {
        if (p.mode === 'set') {
          row('marginSetW')[t] = 1;
          row('marginSetV')[t] = clamp(x, pm.min, pm.max);
        } else row('marginAdd')[t] += x;
      } else if (p.lever === 'capexPct') {
        const r = (adj.capex ??= modelCapexPath(a));
        r[t] = clamp(p.mode === 'set' ? x : r[t] + x, pm.min, pm.max);
      } else {
        const r = row('rfAdd');
        r[t] = p.mode === 'set' ? clamp(x, pm.min, pm.max) - a.rf : r[t] + x;
      }
    });
  }
  if (base.financial && adj.rfAdd) {
    notes.push('Year-by-year rates are not modelled for banks and insurers; use the lasting risk-free rate instead.');
    delete adj.rfAdd;
  }
  if (Object.keys(adj).length) a.adjust = { ...adj, rdFollowsRf: !!v.rdFollowsRf };

  return { a, diffs: diffsOf(base, a, v, touched, s), notes };
}

function diffsOf(base: Assumptions, a: Assumptions, v: Record<VirtualLever, number>, touched: Set<Lever>, s: Pick<Scenario, 'paths'>): ScenarioDiff[] {
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
  void s;
  return out;
}

/** Compact formatting for notes (the UI has its own). */
export function fmtRaw(x: number | null, f: string): string {
  if (x == null || !Number.isFinite(x)) return 'none';
  if (f === 'pct') return `${(x * 100).toFixed(1)}%`;
  if (f === 'x') return `${x.toFixed(1)}x`;
  if (f === 'beta') return x.toFixed(2);
  if (f === 'flag') return x ? 'yes' : 'no';
  return String(+x.toFixed(2));
}

/** Base values of the levers a scenario changes, stored with it to notice later data refreshes. */
export function baseSnapshot(base: Assumptions, s: Pick<Scenario, 'changes'>): Partial<Record<Lever, number>> {
  const out: Partial<Record<Lever, number>> = {};
  for (const c of s.changes) if (isAssumptionLever(c.lever) && base[c.lever] != null) out[c.lever] = base[c.lever] as number;
  return out;
}
