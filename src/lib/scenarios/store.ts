/**
 * Saved scenarios live in this browser only (localStorage), one list per company. Nothing is sent anywhere and share links
 * never include them. Everything read back is validated, so a corrupted or hand-edited entry cannot break the page.
 */
import { LEVERS, PATH_META, type Change, type Lever, type PathChange, type PathLever, type Scenario } from './types';

const PREFIX = 'scenarios:v1:';
export const MAX_PER_COMPANY = 50;
const MAX_TEXT = 400;

export const storageKey = (ticker: string, cik?: string | number | null) => (ticker ? ticker.toUpperCase() : cik ? `CIK${cik}` : '');

const str = (x: unknown, max = MAX_TEXT) => (typeof x === 'string' ? x.slice(0, max) : '');
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function validateScenario(x: unknown): Scenario | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const id = str(o.id, 64);
  const name = str(o.name, 120).trim();
  if (!id || !name || !Array.isArray(o.changes)) return null;
  const changes: Change[] = [];
  for (const c of o.changes.slice(0, 60)) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    const lever = r.lever as Lever;
    const value = num(r.value);
    if (!(lever in LEVERS) || value == null || !['set', 'add', 'scale'].includes(r.op as string)) continue;
    changes.push({ lever, op: r.op as Change['op'], value });
  }
  const paths: PathChange[] = [];
  if (Array.isArray(o.paths))
    for (const p of o.paths.slice(0, 8)) {
      if (!p || typeof p !== 'object') continue;
      const r = p as Record<string, unknown>;
      if (!((r.lever as string) in PATH_META) || !['set', 'add'].includes(r.mode as string) || !Array.isArray(r.values)) continue;
      paths.push({ lever: r.lever as PathLever, mode: r.mode as 'set' | 'add', values: Array.from({ length: 10 }, (_, i) => num((r.values as unknown[])[i])) });
    }
  const baseAtSave: Partial<Record<Lever, number>> = {};
  if (o.baseAtSave && typeof o.baseAtSave === 'object')
    for (const [k, val] of Object.entries(o.baseAtSave as Record<string, unknown>)) if (k in LEVERS && num(val) != null) baseAtSave[k as Lever] = val as number;
  return {
    id,
    name,
    story: str(o.story),
    changes,
    paths,
    templateId: str(o.templateId, 64) || undefined,
    createdAt: str(o.createdAt, 40) || new Date().toISOString(),
    updatedAt: str(o.updatedAt, 40) || new Date().toISOString(),
    baseAtSave,
  };
}

/** Returns null when storage is unavailable (private mode, blocked site data). */
export function loadScenarios(key: string): Scenario[] | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(validateScenario).filter((s): s is Scenario => !!s).slice(0, MAX_PER_COMPANY) : [];
  } catch {
    return null;
  }
}

/** False when the list could not be saved (storage blocked or full). */
export function saveScenarios(key: string, list: Scenario[]): boolean {
  if (!key) return false;
  try {
    if (list.length) localStorage.setItem(PREFIX + key, JSON.stringify(list.slice(0, MAX_PER_COMPANY)));
    else localStorage.removeItem(PREFIX + key);
    return true;
  } catch {
    return false;
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** A backup file of one company's scenarios. */
export function exportJson(key: string, list: Scenario[]): string {
  return JSON.stringify({ kind: 'valuation-scenarios', version: 1, company: key, scenarios: list }, null, 2);
}

/** Read a backup file; every scenario gets a fresh id so imports never overwrite. */
export function importJson(text: string): Scenario[] {
  const o = JSON.parse(text);
  const arr = Array.isArray(o) ? o : Array.isArray(o?.scenarios) ? o.scenarios : [];
  return arr
    .map(validateScenario)
    .filter((s: Scenario | null): s is Scenario => !!s)
    .map((s: Scenario) => ({ ...s, id: newId() }));
}
