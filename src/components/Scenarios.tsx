'use client';
/**
 * Scenario maker: saved what-ifs on top of the base case, stored in this browser only. Three levels of freedom: pick a
 * template, adjust a few plain fields, or open every lever plus a year-by-year grid. All of it is numbers, never code.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Assumptions, Sources } from '@/lib/finance/assumptions';
import type { ModelId } from '@/lib/finance/calcsheet';
import { quickRun, type ModelResult } from '@/lib/finance/run';
import type { Historicals } from '@/lib/finance/types';
import { fmt } from '@/lib/format';
import { MODEL_NOTES } from '@/content/modelNotes';
import { SCENARIO_TEMPLATES, type ScenarioTemplate } from '@/content/scenarioTemplates';
import { applyScenario, baseSnapshot } from '@/lib/scenarios/apply';
import { exportJson, importJson, loadScenarios, MAX_PER_COMPANY, newId, saveScenarios, type LoadStatus } from '@/lib/scenarios/store';
import { LEVERS, PATH_META, type Change, type Lever, type LeverFmt, type Op, type PathChange, type PathLever, type Scenario, type ScenarioDiff } from '@/lib/scenarios/types';
import { Label } from './ui';

/* ------------------------------------------------------------------ Storage hook ------------------------------------------------------------------ */

export function useScenarioList(key: string) {
  const [list, setList] = useState<Scenario[]>([]);
  const [status, setStatus] = useState<LoadStatus>('ok');
  useEffect(() => {
    const l = loadScenarios(key);
    setList(l.list);
    setStatus(l.status);
  }, [key]);
  const commit = (next: Scenario[]) => {
    setList(next);
    if (key) setStatus(saveScenarios(key, next) ? 'ok' : 'blocked');
  };
  const full = list.length >= MAX_PER_COMPANY;
  return {
    list,
    status,
    full,
    /** False (and nothing saved) when a new scenario would go over the per-company limit. */
    upsert: (s: Scenario) => {
      const exists = list.some((x) => x.id === s.id);
      if (!exists && full) return false;
      commit(exists ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s]);
      return true;
    },
    remove: (id: string) => commit(list.filter((x) => x.id !== id)),
    /** How many of the given scenarios fitted under the limit. */
    addMany: (xs: Scenario[]) => {
      const fit = xs.slice(0, Math.max(0, MAX_PER_COMPANY - list.length));
      commit([...list, ...fit]);
      return fit.length;
    },
  };
}

const STORAGE_NOTE: Record<LoadStatus, string | null> = {
  ok: null,
  blocked: 'This browser is blocking site storage, so scenarios last only until you leave the page.',
  reset: 'The scenarios saved for this company could not be read (the saved data was damaged), so the list was reset to empty. Saving a scenario replaces the damaged data; restore from a backup file if you have one.',
  session: 'This company has no ticker or CIK to save scenarios under, so they last only until you leave the page.',
};
export type ScenarioList = ReturnType<typeof useScenarioList>;

/* ------------------------------------------------------------------ Formatting ------------------------------------------------------------------ */

export function leverText(x: number | null, f: LeverFmt): string {
  if (x == null || !Number.isFinite(x)) return 'none';
  if (f === 'pct') return `${(x * 100).toFixed(1)}%`;
  if (f === 'x') return `${x.toFixed(1)}x`;
  if (f === 'beta') return x.toFixed(2);
  if (f === 'flag') return x ? 'yes' : 'no';
  if (f === 'yrs') return `${x}`;
  if (f === 'shares') return `${x.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
  return String(+x.toFixed(3));
}
const unitOf = (op: Op, f: LeverFmt) => (op === 'scale' ? '×' : f === 'pct' ? (op === 'add' ? 'pts' : '%') : f === 'yrs' ? 'yrs' : f === 'x' ? 'x' : '');
const toUi = (v: number, op: Op, f: LeverFmt) => (op !== 'scale' && f === 'pct' ? +(v * 100).toFixed(3) : +v.toFixed(4));
const fromUi = (n: number, op: Op, f: LeverFmt) => (op !== 'scale' && f === 'pct' ? n / 100 : n);
const OP_LABEL: Record<Op, string> = { set: 'set to', add: 'change by', scale: 'multiply by' };

export const headlineId = (financial: boolean): ModelId => (financial ? 'ri' : 'fcff');
/** Models driven by the ten-year forecast; the rest rest on today's figures and are shown for reference. */
const FORECAST_MODELS: ModelId[] = ['fcff', 'fcfe', 'apv', 'ri'];
const MODELS: ModelId[] = [...FORECAST_MODELS, 'multiples', 'total_payout', 'ddm_gordon', 'ddm_2stage', 'ddm_h'];

/** "Risk-free rate yrs 1-2" for the year-by-year values a scenario sets, which the input rows cannot show. */
function pathSummary(s: Scenario): string {
  return (s.paths ?? [])
    .map((p) => {
      const yrs = p.values.map((v, i) => (v != null ? i + 1 : 0)).filter(Boolean);
      if (!yrs.length) return '';
      const span = yrs.length === 1 ? `yr ${yrs[0]}` : `yrs ${yrs[0]}-${yrs[yrs.length - 1]}`;
      const vals = Array.from(new Set(p.values.filter((v): v is number => v != null).map((v) => `${p.mode === 'add' && v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}${p.mode === 'add' ? ' pts' : '%'}`)));
      return `${PATH_META[p.lever].label} ${p.mode === 'set' ? '' : 'change '}${vals.length === 1 ? vals[0] : 'varies'} (${span})`;
    })
    .filter(Boolean)
    .join('; ');
}
const pctDiff = (x: number | null | undefined, b: number | null | undefined) => (x != null && b != null && b !== 0 ? x / b - 1 : null);

/** A numeric text box that commits on blur or Enter, like the sidebar fields. */
function NumIn({ value, onChange, label, className = 'w-20' }: { value: number | null; onChange: (v: number | null) => void; label: string; className?: string }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => setText(value == null ? '' : String(value)), [value]);
  return (
    <input
      inputMode="decimal"
      type="number"
      step="any"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number(text);
        onChange(text.trim() === '' || !Number.isFinite(n) ? null : n);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`num rounded border border-seam bg-transparent px-2 py-0.5 text-right text-sm outline-none focus:border-accent ${className}`}
    />
  );
}

/* ------------------------------------------------------------------ Banner ------------------------------------------------------------------ */

export function ScenarioBanner({
  scenario,
  diffs,
  notes,
  base,
  value,
  onBase,
}: {
  scenario: Scenario;
  diffs: ScenarioDiff[];
  notes: string[];
  base: number | null;
  value: number | null;
  onBase: () => void;
}) {
  return (
    <div role="status" className="sticky top-0 z-30 mt-4 rounded-2xl border border-accent/60 bg-panel px-4 py-3 shadow-[0_8px_24px_-12px_rgba(74,14,14,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-accent">Scenario on</span>
          <span className="ml-2 font-serif text-lg">{scenario.name}</span>
          <span className="num ml-3 text-sm text-muted">
            Base case {fmt(base, 'usd') || '–'} → <span className="text-accent">{fmt(value, 'usd') || '–'}</span>
            {pctDiff(value, base) != null && ` (${pctDiff(value, base)! >= 0 ? '+' : ''}${(pctDiff(value, base)! * 100).toFixed(0)}%)`}
          </span>
        </div>
        <button type="button" onClick={onBase} className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-bg hover:bg-accent-hover">
          Back to base case
        </button>
      </div>
      {/* On phones the banner stays short: the full list of changes is in the sidebar note and on the Scenarios tab. */}
      {diffs.length > 0 && (
        <p className="mt-1.5 text-xs text-muted sm:hidden">
          {diffs.length} change{diffs.length === 1 ? '' : 's'} on top of the base case
        </p>
      )}
      {diffs.length > 0 && (
        <p className="mt-1.5 hidden text-xs text-muted sm:block">
          Changes: {diffs.map((d) => `${d.label} ${leverText(d.base, d.fmt)} → ${leverText(d.value, d.fmt)}`).join(' · ')}
          {scenario.paths?.some((p) => p.values.some((v) => v != null)) ? ' · plus year-by-year values' : ''}
        </p>
      )}
      {notes.map((n) => (
        <p key={n} className="mt-1 hidden text-xs text-muted sm:block">
          {n}
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Tab ------------------------------------------------------------------ */

export function ScenariosTab({
  h,
  a,
  src,
  baseResults,
  store,
  storeKey,
  activeId,
  onApply,
}: {
  h: Historicals;
  a: Assumptions;
  src: Sources;
  baseResults: ModelResult[];
  store: ScenarioList;
  storeKey: string;
  activeId: string | null;
  onApply: (id: string | null) => void;
}) {
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const templates = SCENARIO_TEMPLATES.filter((t) => !a.financial || t.financial);

  const fromTemplate = (t: ScenarioTemplate): Scenario => {
    const now = new Date().toISOString();
    const b = t.build(a);
    return { id: newId(), name: t.name, story: t.story, changes: b.changes, paths: b.paths ?? [], templateId: t.id, createdAt: now, updatedAt: now };
  };
  const blank = (): Scenario => {
    const now = new Date().toISOString();
    return { id: newId(), name: 'My scenario', story: '', changes: [], paths: [], createdAt: now, updatedAt: now };
  };

  // Every saved scenario, run once for the comparison table.
  const runs = useMemo(
    () =>
      store.list.map((s) => {
        const ap = applyScenario(a, s);
        const q = quickRun(h, ap.a, src);
        return { s, ap, results: q.results, wacc: (a.financial ? q.values.inputs.re : q.values.inputs.wacc) ?? null };
      }),
    [store.list, a, h, src],
  );

  const baseWacc = useMemo(() => {
    const i = quickRun(h, a, src).values.inputs;
    return (a.financial ? i.re : i.wacc) ?? null;
  }, [h, a, src]);

  const download = () => {
    const blob = new Blob([exportJson(storeKey, store.list)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${storeKey || 'company'}-scenarios.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (draft)
    return (
      <ScenarioEditor
        h={h}
        a={a}
        src={src}
        baseResults={baseResults}
        draft={draft}
        templates={templates}
        onCancel={() => setDraft(null)}
        error={saveErr}
        onSave={(s, apply) => {
          if (!store.upsert({ ...s, updatedAt: new Date().toISOString(), baseAtSave: baseSnapshot(a, s) })) {
            setSaveErr(`Not saved: you already have ${MAX_PER_COMPANY} scenarios for this company, the limit. Delete one first.`);
            return;
          }
          setSaveErr(null);
          setDraft(null);
          if (apply) onApply(s.id);
        }}
      />
    );

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="font-serif text-3xl">Scenarios</h2>
          <p className="mt-1 text-sm text-muted">
            What if competition arrives, rates jump or the grid runs out of power? A scenario changes a few assumptions on top of the base case and is never on
            unless you switch it on. Scenarios are saved in this browser only, are not part of share links, and go into the Excel download as a scenario switch.
          </p>
          {STORAGE_NOTE[store.status] && <p className="mt-2 text-sm text-accent">{STORAGE_NOTE[store.status]}</p>}
          {store.full && <p className="mt-2 text-sm text-accent">You have {MAX_PER_COMPANY} scenarios for this company, the limit. Delete one to save another.</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={() => setDraft(blank())} className="rounded-full bg-accent px-4 py-1.5 font-semibold text-bg hover:bg-accent-hover">
            New scenario
          </button>
          {store.list.length > 0 && (
            <button type="button" onClick={download} className="rounded-full border border-seam px-4 py-1.5 text-accent hover:bg-panel-strong">
              Back up (JSON)
            </button>
          )}
          <label className="cursor-pointer rounded-full border border-seam px-4 py-1.5 text-accent hover:bg-panel-strong">
            Restore from file
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={async (e) => {
                setImportErr(null);
                try {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const xs = importJson(await f.text());
                  if (!xs.length) throw new Error('No scenarios found in that file.');
                  const n = store.addMany(xs);
                  if (n < xs.length) setImportErr(`Restored ${n} of ${xs.length}: the limit is ${MAX_PER_COMPANY} scenarios per company.`);
                } catch (x) {
                  setImportErr((x as Error).message);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      {importErr && <p className="mt-2 text-sm text-accent">{importErr}</p>}

      {store.list.length > 0 && <Comparison baseResults={baseResults} baseWacc={baseWacc} runs={runs} a={a} activeId={activeId} onApply={onApply} />}

      {store.list.length > 0 && (
        <div className="mt-10">
          <Label>Saved for this company</Label>
          <ul className="mt-3 space-y-3">
            {runs.map(({ s, ap, results }) => {
              const v = results.find((r) => r.id === headlineId(a.financial))?.perShare ?? null;
              const b = baseResults.find((r) => r.id === headlineId(a.financial))?.perShare ?? null;
              const drift = Object.entries(s.baseAtSave ?? {}).filter(([k, x]) => {
                const now = a[k as keyof Assumptions] as number | null;
                return now != null && Math.abs(now - (x as number)) > 0.005;
              });
              const on = activeId === s.id;
              return (
                <li key={s.id} className={`rounded-2xl border px-4 py-3 ${on ? 'border-accent bg-accent/5' : 'border-seam bg-panel/60'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-serif text-xl">{s.name}</div>
                      {s.story && <p className="mt-0.5 text-sm text-muted">{s.story}</p>}
                      <p className="mt-1 font-mono text-[0.6875rem] text-muted">
                        {ap.diffs.length} change{ap.diffs.length === 1 ? '' : 's'}
                        {s.paths?.some((p) => p.values.some((x) => x != null)) ? ' + year-by-year values' : ''} · saved {s.updatedAt.slice(0, 10)}
                      </p>
                      {drift.length > 0 && (
                        <p className="mt-1 text-xs text-accent">
                          The base case has moved since you saved this ({drift.map(([k, x]) => `${LEVERS[k as Lever].label.toLowerCase()} ${leverText(x as number, LEVERS[k as Lever].fmt)} → ${leverText(a[k as keyof Assumptions] as number, LEVERS[k as Lever].fmt)}`).join(', ')}). Relative changes still apply on top.
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="num text-xl text-accent">{fmt(v, 'usd') || '–'}</div>
                      <div className="font-mono text-[0.6875rem] text-muted">
                        {pctDiff(v, b) != null ? `${pctDiff(v, b)! >= 0 ? '+' : ''}${(pctDiff(v, b)! * 100).toFixed(0)}% vs base` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => onApply(on ? null : s.id)}
                      className={`rounded-full px-4 py-1 ${on ? 'border border-accent text-accent' : 'bg-accent font-semibold text-bg hover:bg-accent-hover'}`}
                    >
                      {on ? 'Switch off' : 'Switch on'}
                    </button>
                    <button type="button" onClick={() => setDraft(s)} className="rounded-full border border-seam px-4 py-1 text-accent hover:bg-panel-strong">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...s, id: newId(), name: `${s.name} (copy)`, createdAt: new Date().toISOString() })}
                      className="rounded-full border border-seam px-4 py-1 text-accent hover:bg-panel-strong"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (on) onApply(null);
                        store.remove(s.id);
                      }}
                      className="rounded-full border border-seam px-4 py-1 text-muted hover:text-ink"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-10">
        <Label>Start from a template</Label>
        <p className="mt-1 text-xs text-muted">Each template changes assumptions relative to this company&apos;s base case. Open one, adjust it, save it.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="flex flex-col rounded-2xl border border-seam bg-panel/60 px-4 py-3 transition-colors hover:border-accent">
              <div className="font-serif text-lg">{t.name}</div>
              <p className="mt-1 text-sm">{t.story}</p>
              <p className="mt-1.5 text-xs text-muted">{t.why}</p>
              {t.caution?.(a) && <p className="mt-1.5 text-xs text-accent">{t.caution(a)}</p>}
              <Evidence t={t} />
              <button type="button" onClick={() => setDraft(fromTemplate(t))} className="mt-3 self-start rounded-full border border-accent/50 px-4 py-1 text-sm text-accent hover:bg-accent/5">
                Use this template
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Where a template's numbers come from: the evidence, which numbers are judgment, and the sources. */
function Evidence({ t }: { t: ScenarioTemplate }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-accent">Where the numbers come from</summary>
      <p className="mt-1 text-muted">{t.basis}</p>
      {t.sources.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
          {t.sources.map((s) => (
            <li key={s.label}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="link">
                  {s.label}
                </a>
              ) : (
                s.label
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/* ------------------------------------------------------------------ Comparison ------------------------------------------------------------------ */

function Comparison({
  baseResults,
  baseWacc,
  runs,
  a,
  activeId,
  onApply,
}: {
  baseResults: ModelResult[];
  runs: { s: Scenario; ap: ReturnType<typeof applyScenario>; results: ModelResult[]; wacc: number | null }[];
  baseWacc: number | null;
  a: Assumptions;
  activeId: string | null;
  onApply: (id: string | null) => void;
}) {
  const models = MODELS.filter((id) => baseResults.some((r) => r.id === id && r.status === 'ok'));
  const inputRows: { label: string; get: (x: Assumptions) => number | null; f: 'pct' | 'beta' }[] = a.financial
    ? [
        { label: 'Risk-free rate', get: (x) => x.rf, f: 'pct' },
        { label: 'Beta', get: (x) => x.beta, f: 'beta' },
        { label: 'Terminal growth', get: (x) => x.gT, f: 'pct' },
      ]
    : [
        { label: 'Target margin', get: (x) => x.marginTarget, f: 'pct' },
        { label: 'Growth, latest year', get: (x) => x.g1, f: 'pct' },
        { label: 'Capex, % of revenue', get: (x) => x.capexPct, f: 'pct' },
        { label: 'Risk-free rate', get: (x) => x.rf, f: 'pct' },
        { label: 'Beta', get: (x) => x.beta, f: 'beta' },
      ];
  const cell = (rs: ModelResult[], id: ModelId) => rs.find((r) => r.id === id);
  return (
    <div className="mt-8">
      <Label>Side by side</Label>
      <p className="mt-1 text-xs text-muted">Value per share under each scenario, with the change from the base case. Year-by-year changes show in the models, not in the input rows.</p>
      <div className="mt-3 max-h-[70vh] max-w-full overflow-auto overscroll-contain rounded border border-seam/60">
        <table className="num w-full border-collapse text-[0.8125rem]">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-seam text-muted">
              <th className="sticky left-0 z-20 min-w-[10rem] bg-panel px-2 py-2 text-left font-sans text-xs font-normal">Per share</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal">Base case</th>
              {runs.map(({ s }) => (
                <th key={s.id} className={`min-w-[8rem] px-3 py-2 text-right font-normal ${activeId === s.id ? 'text-accent' : ''}`}>
                  <div className="font-sans text-ink">{s.name}</div>
                  <button type="button" onClick={() => onApply(activeId === s.id ? null : s.id)} className="mt-0.5 font-sans text-xs text-accent underline-offset-2 hover:underline">
                    {activeId === s.id ? 'on · switch off' : 'switch on'}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((id, k) => {
              const b = cell(baseResults, id)?.perShare ?? null;
              const ref = !FORECAST_MODELS.includes(id);
              const firstRef = ref && (k === 0 || FORECAST_MODELS.includes(models[k - 1]));
              return (
                <Fragment key={id}>
                {firstRef && (
                  <tr className="border-b border-seam/60">
                    <td colSpan={2 + runs.length} className="sticky left-0 bg-panel px-2 pb-1 pt-3 font-sans text-xs text-muted">
                      For reference: these rest on today&apos;s earnings, dividends and peer multiples, not on the forecast, so scenarios move them little or unevenly.
                    </td>
                  </tr>
                )}
                <tr className={`border-b border-seam/60 ${ref ? 'text-muted' : ''}`}>
                  <td className="sticky left-0 bg-panel px-2 py-1.5 font-sans">{MODEL_NOTES[id]?.short ?? id}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(b, 'usd') || '–'}</td>
                  {runs.map(({ s, results }) => {
                    const r = cell(results, id);
                    const v = r?.status === 'ok' ? r.perShare : null;
                    const d = pctDiff(v, b);
                    return (
                      <td key={s.id} className="px-3 py-1.5 text-right" title={r?.status !== 'ok' ? r?.message : undefined}>
                        <div>{v != null ? fmt(v, 'usd') : r ? 'n/a' : '–'}</div>
                        {d != null && Math.abs(d) >= 0.0005 && <div className={`text-[0.6875rem] ${d < 0 ? 'text-accent' : 'text-muted'}`}>{`${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}%`}</div>}
                      </td>
                    );
                  })}
                </tr>
                </Fragment>
              );
            })}
            {inputRows.map((row) => (
              <tr key={row.label} className="border-b border-seam/60 text-muted">
                <td className="sticky left-0 bg-panel px-2 py-1.5 font-sans">{row.label}</td>
                <td className="px-3 py-1.5 text-right">{fmt(row.get(a), row.f) || '–'}</td>
                {runs.map(({ s, ap }) => (
                  <td key={s.id} className="px-3 py-1.5 text-right">
                    {fmt(row.get(ap.a), row.f) || '–'}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-b border-seam/60 text-muted">
              <td className="sticky left-0 bg-panel px-2 py-1.5 font-sans">{a.financial ? 'Cost of equity' : 'WACC (lasting)'}</td>
              <td className="px-3 py-1.5 text-right">{fmt(baseWacc, 'pct') || '–'}</td>
              {runs.map(({ s, wacc }) => (
                <td key={s.id} className="px-3 py-1.5 text-right">
                  {fmt(wacc, 'pct') || '–'}
                </td>
              ))}
            </tr>
            {runs.some(({ s }) => pathSummary(s)) && (
              <tr className="border-b border-seam/60 text-muted">
                <td className="sticky left-0 bg-panel px-2 py-1.5 font-sans">Also year by year</td>
                <td className="px-3 py-1.5 text-right">–</td>
                {runs.map(({ s }) => (
                  <td key={s.id} className="px-3 py-1.5 text-right font-sans text-xs">
                    {pathSummary(s) || '–'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Editor ------------------------------------------------------------------ */

/** The plain fields of the simple level, and the operation each one uses. */
const SIMPLE: { lever: Lever; op: Op; hint: string }[] = [
  { lever: 'marginTarget', op: 'add', hint: 'points, e.g. -10' },
  { lever: 'gDecay', op: 'add', hint: 'points, e.g. -15 = fades faster' },
  { lever: 'capexPct', op: 'scale', hint: 'times, e.g. 1.5' },
  { lever: 'rf', op: 'add', hint: 'points, e.g. 2' },
  { lever: 'shockYear', op: 'set', hint: 'year 1-10, blank = none' },
  { lever: 'shockRevLoss', op: 'set', hint: '% of revenue lost that year' },
  { lever: 'shockMarginDrop', op: 'set', hint: 'margin points lost' },
];
const GROUPS = Array.from(new Set(Object.values(LEVERS).map((m) => m.group)));
const PATHS: PathLever[] = ['growth', 'margin', 'capexPct', 'rf'];

function ScenarioEditor({
  h,
  a,
  src,
  baseResults,
  draft: initial,
  templates,
  onCancel,
  onSave,
  error,
}: {
  h: Historicals;
  a: Assumptions;
  src: Sources;
  baseResults: ModelResult[];
  draft: Scenario;
  templates: ScenarioTemplate[];
  onCancel: () => void;
  onSave: (s: Scenario, apply: boolean) => void;
  error: string | null;
}) {
  const [s, setS] = useState<Scenario>(initial);
  const [advanced, setAdvanced] = useState(() => (initial.paths ?? []).some((p) => p.values.some((v) => v != null)) || initial.changes.some((c) => !SIMPLE.some((x) => x.lever === c.lever && x.op === c.op)));
  const levers = (Object.keys(LEVERS) as Lever[]).filter((l) => !a.financial || LEVERS[l].financial);

  const applied = useMemo(() => applyScenario(a, s), [a, s]);
  const preview = useMemo(() => quickRun(h, applied.a, src), [h, applied, src]);
  const hid = headlineId(a.financial);
  const baseV = baseResults.find((r) => r.id === hid)?.perShare ?? null;
  const v = preview.results.find((r) => r.id === hid);
  const baseF = useMemo(() => quickRun(h, a, src).values.sheets.FCFF, [h, a, src]);

  const setChange = (lever: Lever, op: Op, value: number | null) =>
    setS((p) => ({ ...p, changes: value == null ? p.changes.filter((c) => c.lever !== lever) : p.changes.some((c) => c.lever === lever) ? p.changes.map((c) => (c.lever === lever ? { lever, op, value } : c)) : [...p.changes, { lever, op, value }] }));
  const setPath = (lever: PathLever, patch: Partial<PathChange>) =>
    setS((p) => {
      const cur = p.paths?.find((x) => x.lever === lever) ?? { lever, mode: 'set' as const, values: Array.from({ length: 10 }, () => null) };
      const next = { ...cur, ...patch };
      const rest = (p.paths ?? []).filter((x) => x.lever !== lever);
      return { ...p, paths: next.values.some((x) => x != null) || patch.mode ? [...rest, next] : rest };
    });

  const modelPath = (l: PathLever): (number | null)[] =>
    Array.from({ length: 10 }, (_, i) => {
      const t = i + 1;
      if (l === 'growth') return baseF?.growth?.[t] ?? null;
      if (l === 'margin') return baseF?.margin?.[t] ?? null;
      if (l === 'capexPct') {
        const c = baseF?.capex?.[t];
        const r = baseF?.revenue?.[t];
        return c != null && r ? c / r : null;
      }
      return a.rf;
    });

  return (
    <section className="max-w-5xl">
      <button type="button" onClick={onCancel} className="text-sm text-accent hover:underline">
        ← Back to scenarios
      </button>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <label className="block">
            <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted">Name</span>
            <input value={s.name} maxLength={120} onChange={(e) => setS({ ...s, name: e.target.value })} className="mt-1 w-full rounded border border-seam bg-transparent px-3 py-2 font-serif text-2xl outline-none focus:border-accent" />
          </label>
          <label className="mt-3 block">
            <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted">The story</span>
            <textarea value={s.story} maxLength={400} rows={2} onChange={(e) => setS({ ...s, story: e.target.value })} placeholder="What happens, and why it would" className="mt-1 w-full rounded border border-seam bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
          </label>
        </div>
        <aside className="rounded-2xl border border-seam bg-panel/70 px-4 py-3 lg:sticky lg:top-6 lg:self-start">
          <Label>{MODEL_NOTES[hid]?.short ?? 'Value'} per share</Label>
          <div className="num mt-1 text-3xl text-accent">{v?.status === 'ok' ? fmt(v.perShare, 'usd') : 'n/a'}</div>
          <div className="num text-sm text-muted">
            base {fmt(baseV, 'usd') || '–'}
            {v?.status === 'ok' && pctDiff(v.perShare, baseV) != null && ` · ${pctDiff(v.perShare, baseV)! >= 0 ? '+' : ''}${(pctDiff(v.perShare, baseV)! * 100).toFixed(0)}%`}
          </div>
          {v?.status !== 'ok' && v?.message && <p className="mt-1 text-xs text-muted">{v.message}</p>}
          {(() => {
            const t = templates.find((x) => x.id === s.templateId);
            const note = t?.caution?.(a);
            return (
              <>
                {note && <p className="mt-2 text-xs text-accent">{note}</p>}
                {t && <Evidence t={t} />}
              </>
            );
          })()}
          {error && <p className="mt-2 text-xs text-accent">{error}</p>}
          {applied.notes.map((n) => (
            <p key={n} className="mt-2 text-xs text-muted">
              {n}
            </p>
          ))}
          <div className="mt-4 flex flex-col gap-2 text-sm">
            <button type="button" disabled={!s.name.trim()} onClick={() => onSave({ ...s, name: s.name.trim() }, true)} className="rounded-full bg-accent px-4 py-1.5 font-semibold text-bg hover:bg-accent-hover disabled:opacity-40">
              Save and switch on
            </button>
            <button type="button" disabled={!s.name.trim()} onClick={() => onSave({ ...s, name: s.name.trim() }, false)} className="rounded-full border border-seam px-4 py-1.5 text-accent hover:bg-panel-strong disabled:opacity-40">
              Save
            </button>
            <button type="button" onClick={onCancel} className="text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </aside>
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>The main levers</Label>
          <label className="flex items-center gap-2 text-xs text-muted">
            Add changes from a template
            <select
              value=""
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (!t) return;
                const b = t.build(a);
                setS((p) => ({
                  ...p,
                  changes: [...p.changes.filter((c) => !b.changes.some((x) => x.lever === c.lever)), ...b.changes],
                  paths: [...(p.paths ?? []).filter((x) => !(b.paths ?? []).some((y) => y.lever === x.lever)), ...(b.paths ?? [])],
                }));
              }}
              className="rounded border border-seam bg-transparent px-2 py-1 text-ink"
            >
              <option value="">Pick…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 grid gap-x-8 sm:grid-cols-2">
          {SIMPLE.filter((x) => levers.includes(x.lever)).map(({ lever, op: defOp, hint }) => {
            const m = LEVERS[lever];
            const c = s.changes.find((x) => x.lever === lever);
            const op = c?.op ?? defOp;
            const before = applied.diffs.find((d) => d.lever === lever);
            const baseVal = lever in a ? (a[lever as keyof Assumptions] as number | null) : null;
            return (
              <div key={lever} className="border-b border-seam/60 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{m.label}</span>
                  <span className="flex items-baseline gap-1">
                    <span className="text-xs text-muted">{OP_LABEL[op]}</span>
                    <NumIn label={m.label} value={c ? toUi(c.value, op, m.fmt) : null} onChange={(n) => setChange(lever, op, n == null ? null : fromUi(n, op, m.fmt))} />
                    <span className="num w-7 text-xs text-muted">{unitOf(op, m.fmt)}</span>
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[0.6875rem] text-muted">
                  {before ? `${leverText(before.base, m.fmt)} → ${leverText(before.value, m.fmt)}` : baseVal != null ? `base ${leverText(baseVal, m.fmt)} · ${hint}` : hint}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button type="button" onClick={() => setAdvanced(!advanced)} className="mt-6 text-sm text-accent hover:underline" aria-expanded={advanced}>
        {advanced ? 'Hide advanced' : 'Advanced: every lever and year-by-year values'}
      </button>
      {advanced && (
        <div className="mt-4 space-y-8">
          <div>
            <Label>Every change</Label>
            <p className="mt-1 text-xs text-muted">Pick a lever and say what happens to it. &quot;Change by&quot; and &quot;multiply by&quot; work from the base case, so they still make sense after the monthly data update.</p>
            <ul className="mt-2 space-y-2">
              {s.changes.map((c, i) => {
                const m = LEVERS[c.lever];
                const d = applied.diffs.find((x) => x.lever === c.lever);
                return (
                  <li key={`${c.lever}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <select
                      aria-label="Lever"
                      value={c.lever}
                      onChange={(e) => {
                        const l = e.target.value as Lever;
                        if (s.changes.some((x, j) => j !== i && x.lever === l)) return;
                        setS({ ...s, changes: s.changes.map((x, j) => (j === i ? { lever: l, op: LEVERS[l].op, value: 0 } : x)) });
                      }}
                      className="max-w-[16rem] rounded border border-seam bg-transparent px-2 py-1"
                    >
                      {GROUPS.map((g) => (
                        <optgroup key={g} label={g}>
                          {levers
                            .filter((l) => LEVERS[l].group === g)
                            .map((l) => (
                              <option key={l} value={l}>
                                {LEVERS[l].label}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    <select
                      aria-label="Operation"
                      value={c.op}
                      onChange={(e) => {
                        const op = e.target.value as Op;
                        const value = op === 'scale' ? 1 : op === 'add' ? 0 : ((c.lever in a ? (a[c.lever as keyof Assumptions] as number) : 0) ?? 0);
                        setS({ ...s, changes: s.changes.map((x, j) => (j === i ? { ...x, op, value } : x)) });
                      }}
                      className="rounded border border-seam bg-transparent px-2 py-1"
                    >
                      {(['set', 'add', 'scale'] as Op[]).map((o) => (
                        <option key={o} value={o}>
                          {OP_LABEL[o]}
                        </option>
                      ))}
                    </select>
                    <NumIn
                      label={`${m.label} value`}
                      value={toUi(c.value, c.op, m.fmt)}
                      onChange={(n) => n != null && setS({ ...s, changes: s.changes.map((x, j) => (j === i ? { ...x, value: fromUi(n, c.op, m.fmt) } : x)) })}
                    />
                    <span className="num w-7 text-xs text-muted">{unitOf(c.op, m.fmt)}</span>
                    <span className="font-mono text-[0.6875rem] text-muted">{d ? `${leverText(d.base, m.fmt)} → ${leverText(d.value, m.fmt)}` : ''}</span>
                    <button type="button" onClick={() => setS({ ...s, changes: s.changes.filter((_, j) => j !== i) })} className="ml-auto text-xs text-muted hover:text-accent" aria-label={`Remove ${m.label}`}>
                      remove
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => {
                const l = levers.find((x) => !s.changes.some((c) => c.lever === x));
                if (l) setS({ ...s, changes: [...s.changes, { lever: l, op: LEVERS[l].op, value: LEVERS[l].op === 'scale' ? 1 : 0 }] });
              }}
              className="mt-2 rounded-full border border-seam px-3 py-1 text-sm text-accent hover:bg-panel-strong"
            >
              + Add a change
            </button>
            {levers.filter((l) => s.changes.some((c) => c.lever === l) && LEVERS[l].help).length > 0 && (
              <ul className="mt-3 space-y-0.5 text-xs text-muted">
                {levers
                  .filter((l) => s.changes.some((c) => c.lever === l) && LEVERS[l].help)
                  .map((l) => (
                    <li key={l}>
                      {LEVERS[l].label}: {LEVERS[l].help}
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div>
            <Label>Year by year</Label>
            <p className="mt-1 text-xs text-muted">
              Type a value for any year and leave the rest blank to keep the model&apos;s path (shown underneath). These apply last, on top of everything above.
              {a.financial ? ' Not available for banks and insurers, which are valued on book equity: use the lasting levers above.' : ''}
            </p>
            <div className="mt-3 max-w-full overflow-x-auto rounded border border-seam/60">
              <table className="num w-full border-collapse text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-seam text-muted">
                    <th className="sticky left-0 z-10 min-w-[12rem] bg-panel px-2 py-1.5 text-left font-sans text-xs font-normal">%</th>
                    {Array.from({ length: 10 }, (_, i) => (
                      <th key={i} className="px-1 py-1.5 text-right font-normal">
                        Yr {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PATHS.filter((l) => !a.financial).map((l) => {
                    const p = s.paths?.find((x) => x.lever === l);
                    const mode = p?.mode ?? 'set';
                    const mp = modelPath(l);
                    return (
                      <tr key={l} className="border-b border-seam/60 align-top">
                        <td className="sticky left-0 z-10 bg-panel px-2 py-1.5 font-sans">
                          <div>{PATH_META[l].label}</div>
                          <select aria-label={`${PATH_META[l].label} mode`} value={mode} onChange={(e) => setPath(l, { mode: e.target.value as 'set' | 'add' })} className="mt-1 rounded border border-seam bg-transparent px-1 py-0.5 text-xs">
                            <option value="set">set to (%)</option>
                            <option value="add">change by (pts)</option>
                          </select>
                        </td>
                        {Array.from({ length: 10 }, (_, i) => (
                          <td key={i} className="px-1 py-1.5 text-right">
                            <NumIn
                              className="w-16"
                              label={`${PATH_META[l].label}, year ${i + 1}`}
                              value={p?.values[i] != null ? +(p.values[i]! * 100).toFixed(3) : null}
                              onChange={(n) => {
                                const vals = [...(p?.values ?? Array.from({ length: 10 }, () => null))];
                                vals[i] = n == null ? null : n / 100;
                                setPath(l, { values: vals, mode });
                              }}
                            />
                            <div className="mt-0.5 text-[0.625rem] text-muted">{fmt(mp[i], 'pct')}</div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
