/**
 * A tiny spreadsheet engine. Models are written once as formulas; this module
 * evaluates them for the website and compiles the same formulas to Excel A1
 * syntax for the export, so the site and the workbook cannot disagree.
 *
 * Formula syntax (placeholder form):
 *   names           rf, tax, price           -> Inputs cells (Excel defined names)
 *   same-sheet refs @fcff[3]                 -> row "fcff", column 3 (0 = base year)
 *   other sheet     @FCFF.ev[0]
 *   ranges          SUM(@pv[1]:@pv[10])
 *   functions       SUM MIN MAX AVERAGE ABS
 *   operators       + - * / ^ ( )
 */

export type Fmt = 'usd' | 'usdm' | 'pct' | 'x' | 'num' | 'shares' | 'beta';

export interface InputDef {
  key: string;
  label: string;
  /** A number, null (needs input), or a formula starting with '='. */
  value: number | null | string;
  fmt: Fmt;
  group: 'Market' | 'Company' | 'Cost of capital' | 'Forecast' | 'Peers' | 'Scenarios';
  source: string;
  note?: string;
}

export interface RowDef {
  key: string;
  label: string;
  fmt: Fmt;
  /** Index = column (0 = base year). Each entry: number, null, or '=' formula. */
  cells: (number | null | string)[];
  note?: string;
  emphasis?: boolean;
}

export type ModelId =
  | 'fcff'
  | 'fcfe'
  | 'apv'
  | 'ddm_gordon'
  | 'ddm_2stage'
  | 'total_payout'
  | 'ddm_h'
  | 'ri'
  | 'multiples'
  | 'reverse'
  | 'scenarios'
  | 'fcff_bear'
  | 'fcff_base'
  | 'fcff_bull';

export interface SheetDef {
  id: ModelId;
  /** Excel sheet name (≤31 chars, no spaces needed). */
  name: string;
  title: string;
  columns: string[];
  rows: RowDef[];
  /** Row key + column holding value per share. */
  result: { row: string; col: number };
  status: 'ok' | 'na' | 'needs-input';
  message?: string;
}

export interface Workbook {
  inputs: InputDef[];
  sheets: SheetDef[];
}

/* ---------------------------------- Parsing --------------------------------- */

type Node =
  | { k: 'num'; v: number }
  | { k: 'name'; name: string }
  | { k: 'ref'; sheet?: string; row: string; col: number }
  | { k: 'range'; from: Extract<Node, { k: 'ref' }>; to: Extract<Node, { k: 'ref' }> }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'fn'; name: string; args: Node[] };

const cache = new Map<string, Node>();

export function parse(src: string): Node {
  const hit = cache.get(src);
  if (hit) return hit;
  const s = src.startsWith('=') ? src.slice(1) : src;
  let i = 0;
  const ws = () => {
    while (s[i] === ' ') i++;
  };
  const peek = () => (ws(), s[i]);
  const eat = (c: string) => {
    ws();
    if (s[i] !== c) throw new Error(`Expected '${c}' at ${i} in ${src}`);
    i++;
  };
  const ident = () => {
    ws();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (!m) throw new Error(`Identifier expected at ${i} in ${src}`);
    i += m[0].length;
    return m[0];
  };
  const ref = (): Extract<Node, { k: 'ref' }> => {
    eat('@');
    let a = ident();
    let sheet: string | undefined;
    if (s[i] === '.') {
      i++;
      sheet = a;
      a = ident();
    }
    eat('[');
    ws();
    const m = /^\d+/.exec(s.slice(i));
    if (!m) throw new Error(`Column index expected in ${src}`);
    i += m[0].length;
    eat(']');
    return { k: 'ref', sheet, row: a, col: Number(m[0]) };
  };
  const primary = (): Node => {
    const c = peek();
    if (c === '(') {
      i++;
      const e = expr();
      eat(')');
      return e;
    }
    if (c === '@') {
      const r = ref();
      if (peek() === ':') {
        i++;
        return { k: 'range', from: r, to: ref() };
      }
      return r;
    }
    if (c !== undefined && /[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(e[-+]?\d+)?/i.exec(s.slice(i))!;
      i += m[0].length;
      return { k: 'num', v: Number(m[0]) };
    }
    const id = ident();
    if (peek() === '(') {
      i++;
      const args: Node[] = [];
      if (peek() !== ')') {
        args.push(expr());
        while (peek() === ',') {
          i++;
          args.push(expr());
        }
      }
      eat(')');
      return { k: 'fn', name: id.toUpperCase(), args };
    }
    return { k: 'name', name: id };
  };
  const unary = (): Node => (peek() === '-' ? (i++, { k: 'neg', a: unary() }) : primary());
  const power = (): Node => {
    const a = unary();
    if (peek() === '^') {
      i++;
      return { k: 'bin', op: '^', a, b: power() };
    }
    return a;
  };
  const term = (): Node => {
    let a = power();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      a = { k: 'bin', op, a, b: power() };
    }
    return a;
  };
  const expr = (): Node => {
    let a = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      a = { k: 'bin', op, a, b: term() };
    }
    return a;
  };
  const n = expr();
  ws();
  if (i < s.length) throw new Error(`Unexpected '${s[i]}' at ${i} in ${src}`);
  cache.set(src, n);
  return n;
}

/* -------------------------------- Evaluation -------------------------------- */

export type Values = {
  inputs: Record<string, number | null>;
  sheets: Record<string, Record<string, (number | null)[]>>;
};

/**
 * Evaluate every input and sheet cell. `overrides` replaces input values
 * (used for sensitivity grids and the reverse DCF solver).
 */
export function evaluate(wb: Workbook, overrides: Record<string, number> = {}): Values {
  const inputDefs = new Map(wb.inputs.map((d) => [d.key, d]));
  const sheetDefs = new Map(wb.sheets.map((s) => [s.name, s]));
  const inVals: Record<string, number | null> = {};
  const inBusy = new Set<string>();
  const sVals: Record<string, Record<string, (number | null | undefined)[]>> = {};

  const getInput = (key: string): number | null => {
    if (key in overrides) return overrides[key];
    if (key in inVals) return inVals[key];
    const d = inputDefs.get(key);
    if (!d) throw new Error(`Unknown input '${key}'`);
    if (inBusy.has(key)) throw new Error(`Circular input '${key}'`);
    inBusy.add(key);
    const v = typeof d.value === 'string' ? ev(parse(d.value), undefined) : d.value;
    inBusy.delete(key);
    return (inVals[key] = v);
  };

  const getCell = (sheet: string, row: string, col: number): number | null => {
    const sv = (sVals[sheet] ??= {});
    const arr = (sv[row] ??= []);
    if (arr[col] !== undefined) return arr[col]!;
    const def = sheetDefs.get(sheet)?.rows.find((r) => r.key === row);
    if (!def) throw new Error(`Unknown cell ${sheet}.${row}`);
    const raw = def.cells[col];
    arr[col] = null; // guards against cycles
    const v = raw == null ? null : typeof raw === 'number' ? raw : ev(parse(raw), sheet);
    arr[col] = v;
    return v;
  };

  const ev = (n: Node, sheet: string | undefined): number | null => {
    switch (n.k) {
      case 'num':
        return n.v;
      case 'name':
        return getInput(n.name);
      case 'ref':
        return getCell(n.sheet ?? sheet!, n.row, n.col);
      case 'neg': {
        const a = ev(n.a, sheet);
        return a == null ? null : -a;
      }
      case 'bin': {
        const a = ev(n.a, sheet);
        const b = ev(n.b, sheet);
        if (a == null || b == null) return null;
        let r: number;
        switch (n.op) {
          case '+': r = a + b; break;
          case '-': r = a - b; break;
          case '*': r = a * b; break;
          case '/': r = b === 0 ? NaN : a / b; break;
          default: r = Math.pow(a, b);
        }
        return Number.isFinite(r) ? r : null;
      }
      case 'range':
        throw new Error('Range outside a function');
      case 'fn': {
        const vals: (number | null)[] = [];
        for (const a of n.args) {
          if (a.k === 'range') {
            const sh = a.from.sheet ?? sheet!;
            for (let c = a.from.col; c <= a.to.col; c++) vals.push(getCell(sh, a.from.row, c));
          } else vals.push(ev(a, sheet));
        }
        const nums = vals.filter((v): v is number => v != null);
        switch (n.name) {
          case 'SUM':
            return vals.some((v) => v == null) ? null : nums.reduce((x, y) => x + y, 0);
          case 'AVERAGE':
            return nums.length ? nums.reduce((x, y) => x + y, 0) / nums.length : null;
          case 'MIN':
            return vals.some((v) => v == null) ? null : Math.min(...nums);
          case 'MAX':
            return vals.some((v) => v == null) ? null : Math.max(...nums);
          case 'ABS':
            return nums.length ? Math.abs(nums[0]) : null;
          default:
            throw new Error(`Unknown function ${n.name}`);
        }
      }
    }
  };

  for (const d of wb.inputs) getInput(d.key);
  const out: Values = { inputs: inVals, sheets: {} };
  for (const s of wb.sheets) {
    out.sheets[s.name] = {};
    for (const r of s.rows) out.sheets[s.name][r.key] = r.cells.map((_, c) => getCell(s.name, r.key, c));
  }
  return out;
}

export function resultOf(wb: Workbook, vals: Values, id: ModelId): number | null {
  const s = wb.sheets.find((x) => x.id === id);
  if (!s || s.status !== 'ok') return null;
  return vals.sheets[s.name][s.result.row]?.[s.result.col] ?? null;
}

/* ------------------------------ Excel compiling ----------------------------- */

export const colLetter = (n: number) => {
  let s = '';
  n += 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** Sheet layout: column A holds labels, column B is model column 0, header in row 1, data from row 2. */
export const cellAddress = (sheet: SheetDef, row: string, col: number) => {
  const r = sheet.rows.findIndex((x) => x.key === row);
  if (r < 0) throw new Error(`Unknown row ${sheet.name}.${row}`);
  return `${colLetter(col + 1)}${r + 2}`;
};

export function toExcel(src: string, wb: Workbook, sheet: SheetDef | undefined): string {
  const n = parse(src);
  const sheetByName = new Map(wb.sheets.map((s) => [s.name, s]));
  const refTxt = (r: Extract<Node, { k: 'ref' }>) => {
    const sh = r.sheet ? sheetByName.get(r.sheet)! : sheet!;
    const a = cellAddress(sh, r.row, r.col);
    return r.sheet ? `'${sh.name}'!${a}` : a;
  };
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
  const go = (x: Node, parentPrec = 0, right = false): string => {
    switch (x.k) {
      case 'num':
        return String(x.v);
      case 'name':
        return x.name;
      case 'ref':
        return refTxt(x);
      case 'range':
        return `${refTxt(x.from)}:${refTxt(x.to).replace(/^'.*'!/, '')}`;
      case 'neg':
        return `-${go(x.a, 4)}`;
      case 'fn':
        return `${x.name}(${x.args.map((a) => go(a)).join(',')})`;
      case 'bin': {
        const p = prec[x.op];
        const txt = `${go(x.a, p)}${x.op}${go(x.b, p, true)}`;
        return p < parentPrec || (p === parentPrec && right) ? `(${txt})` : txt;
      }
    }
  };
  return go(n);
}

/** Human-readable formula for the "show calculations" view: refs become row labels. */
export function toReadable(src: string, wb: Workbook, sheet: SheetDef, columns: string[]): string {
  const n = parse(src);
  const labelOf = (r: Extract<Node, { k: 'ref' }>) => {
    const sh = r.sheet ? wb.sheets.find((s) => s.name === r.sheet)! : sheet;
    const row = sh.rows.find((x) => x.key === r.row);
    const colName = (r.sheet ? sh.columns : columns)[r.col] ?? '';
    return `${row?.label ?? r.row}${colName ? ` [${colName}]` : ''}`;
  };
  const inputLabel = new Map(wb.inputs.map((d) => [d.key, d.label]));
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
  const go = (x: Node, parentPrec = 0, right = false): string => {
    switch (x.k) {
      case 'num':
        return String(+x.v.toFixed(6));
      case 'name':
        return inputLabel.get(x.name) ?? x.name;
      case 'ref':
        return labelOf(x);
      case 'range':
        return `${labelOf(x.from)} to ${labelOf(x.to)}`;
      case 'neg':
        return `-${go(x.a, 4)}`;
      case 'fn':
        return `${x.name}(${x.args.map((a) => go(a)).join(', ')})`;
      case 'bin': {
        const p = prec[x.op];
        const op = x.op === '*' ? ' × ' : x.op === '/' ? ' ÷ ' : x.op === '^' ? '^' : ` ${x.op} `;
        const txt = `${go(x.a, p)}${op}${go(x.b, p, true)}`;
        return p < parentPrec || (p === parentPrec && right) ? `(${txt})` : txt;
      }
    }
  };
  return go(n);
}
