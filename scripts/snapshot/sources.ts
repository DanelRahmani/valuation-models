/** External data sources for the monthly snapshot. Each function throws on failure; the caller decides the fallback. */
import { createWriteStream, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Unzip, UnzipInflate } from 'fflate';
import * as XLSX from 'xlsx';
import type { PricePoint } from '../../src/lib/finance/capm';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export async function retry<T>(label: string, fn: () => Promise<T>, tries = 3): Promise<T> {
  let err: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw new Error(`${label}: ${err instanceof Error ? err.message : String(err)}`);
}

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const r = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, ...headers }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}

/* ------------------------------- Constituents ------------------------------ */

export interface Constituent {
  ticker: string;
  name: string;
  sector: string;
  subIndustry: string;
  cik: string;
}

export async function sp500(): Promise<Constituent[]> {
  const txt = await (await get('https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv')).text();
  const lines = txt.trim().split(/\r?\n/).slice(1);
  const out: Constituent[] = [];
  for (const line of lines) {
    // Quoted CSV with commas inside the headquarters field.
    const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, ''));
    const [ticker, name, sector, subIndustry, , , cik] = cols;
    if (ticker && cik) out.push({ ticker, name, sector, subIndustry, cik: cik.padStart(10, '0') });
  }
  if (out.length < 450) throw new Error(`Constituent list has only ${out.length} rows`);
  return out;
}

/* ------------------------------------ SEC ----------------------------------- */

/** SEC's official ticker -> CIK map. Tickers use '-' for share classes (BRK-B). */
export async function secTickerMap(ua: string): Promise<Map<string, string>> {
  const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`SEC ticker map ${r.status}`);
  const j = (await r.json()) as Record<string, { cik_str: number; ticker: string }>;
  return new Map(Object.values(j).map((x) => [x.ticker.toUpperCase(), String(x.cik_str).padStart(10, '0')]));
}

/** Download the nightly bulk file and return the JSON of the wanted CIKs only. */
export async function secBulk(ua: string, ciks: Set<string>, tmpFile: string): Promise<Map<string, unknown>> {
  const r = await fetch('https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip', { headers: { 'User-Agent': ua } });
  if (!r.ok || !r.body) throw new Error(`SEC bulk download ${r.status}`);
  await pipeline(Readable.fromWeb(r.body as any), createWriteStream(tmpFile));

  const found = new Map<string, unknown>();
  await new Promise<void>((resolve, reject) => {
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = (file) => {
      const cik = /CIK(\d{10})\.json$/.exec(file.name)?.[1];
      if (!cik || !ciks.has(cik)) return; // not started = skipped
      const chunks: Uint8Array[] = [];
      file.ondata = (err, data, final) => {
        if (err) return reject(err);
        chunks.push(data);
        if (final) found.set(cik, JSON.parse(Buffer.concat(chunks).toString('utf8')));
      };
      file.start();
    };
    const rs = createReadStream(tmpFile, { highWaterMark: 1 << 20 });
    rs.on('data', (c) => unzip.push(c as Uint8Array));
    rs.on('end', () => {
      unzip.push(new Uint8Array(0), true);
      resolve();
    });
    rs.on('error', reject);
  });
  return found;
}

export async function secOne(ua: string, cik: string): Promise<unknown> {
  const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: { 'User-Agent': ua } });
  if (!r.ok) throw new Error(`SEC ${cik} ${r.status}`);
  return r.json();
}

/* ---------------------------------- Prices ---------------------------------- */

const isoFromUs = (d: string) => {
  const [m, dd, y] = d.split('/');
  return `${y}-${m.padStart(2, '0')}-${dd.padStart(2, '0')}`;
};

export async function nasdaqPrices(ticker: string, etf = false): Promise<PricePoint[]> {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(to.getUTCFullYear() - 5);
  from.setUTCMonth(from.getUTCMonth() - 1);
  const sym = ticker.replace('.', '-');
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/historical?assetclass=${etf ? 'etf' : 'stocks'}&fromdate=${from.toISOString().slice(0, 10)}&todate=${to.toISOString().slice(0, 10)}&limit=9999`;
  const j: any = await (await get(url, { Accept: 'application/json' })).json();
  const rows: any[] = j?.data?.tradesTable?.rows ?? [];
  if (rows.length < 200) throw new Error(`Nasdaq ${ticker}: ${rows.length} rows`);
  return rows.map((r) => ({ date: isoFromUs(r.date), close: Number(String(r.close).replace(/[$,]/g, '')) })).sort((a, b) => a.date.localeCompare(b.date));
}

export async function yahooPrices(ticker: string): Promise<PricePoint[]> {
  const sym = ticker.replace('.', '-');
  const j: any = await (await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1d`)).json();
  const res = j?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const cl: (number | null)[] = res?.indicators?.adjclose?.[0]?.adjclose ?? res?.indicators?.quote?.[0]?.close ?? [];
  const out = ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: Math.round((cl[i] ?? NaN) * 100) / 100 })).filter((p) => Number.isFinite(p.close));
  if (out.length < 200) throw new Error(`Yahoo ${ticker}: ${out.length} rows`);
  return out;
}

/* --------------------------------- Damodaran -------------------------------- */

const DAM = 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/';

async function damSheet(file: string): Promise<{ header: string[]; rows: any[][] }> {
  const buf = new Uint8Array(await (await get(DAM + file)).arrayBuffer());
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames.find((n) => /industry averages/i.test(n)) ?? wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
  const hi = all.findIndex((r) => r?.[0] === 'Industry Name');
  if (hi < 0) throw new Error(`${file}: no header row`);
  return { header: all[hi].map(String), rows: all.slice(hi + 1).filter((r) => typeof r?.[0] === 'string' && typeof r?.[1] === 'number') };
}

export interface Industry {
  name: string;
  firms: number;
  unleveredBeta: number | null;
  pe: number | null;
  evEbitda: number | null;
  evSales: number | null;
  pb: number | null;
  peg: number | null;
}

export async function damodaranIndustries(): Promise<Industry[]> {
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
  const [beta, pe, ev, ps, pb] = await Promise.all(['betas.xls', 'pedata.xls', 'vebitda.xls', 'psdata.xls', 'pbvdata.xls'].map(damSheet));
  const col = (s: { header: string[] }, re: RegExp) => s.header.findIndex((h) => re.test(h.trim()));
  const pick = (s: { header: string[]; rows: any[][] }, re: RegExp) => {
    const c = col(s, re);
    return new Map(s.rows.map((r) => [r[0] as string, num(r[c])]));
  };
  const bu = pick(beta, /^Unlevered beta$/i);
  const peM = pick(pe, /^Current PE$/i);
  const pegM = pick(pe, /^PEG Ratio$/i);
  const evM = pick(ev, /^EV\/EBITDA$/i);
  const esM = pick(ps, /^EV\/Sales$/i);
  const pbM = pick(pb, /^PBV$/i);
  return beta.rows
    .filter((r) => !/^Total Market/i.test(r[0]))
    .map((r) => ({
      name: r[0],
      firms: r[1],
      unleveredBeta: bu.get(r[0]) ?? null,
      pe: peM.get(r[0]) ?? null,
      evEbitda: evM.get(r[0]) ?? null,
      evSales: esM.get(r[0]) ?? null,
      pb: pbM.get(r[0]) ?? null,
      peg: pegM.get(r[0]) ?? null,
    }));
}

/** Damodaran's implied ERP (FCFE) for the most recent year-end in histimpl.xls. */
export async function damodaranErp(): Promise<{ erp: number; label: string }> {
  const buf = new Uint8Array(await (await get(DAM + 'histimpl.xls')).arrayBuffer());
  const wb = XLSX.read(buf);
  const all = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const hi = all.findIndex((r) => r?.[0] === 'Year');
  const c = all[hi].findIndex((h: unknown) => /Implied ERP \(FCFE\)/.test(String(h)));
  const years = all.slice(hi + 1).filter((r) => typeof r?.[0] === 'number' && typeof r?.[c] === 'number');
  const last = years.at(-1);
  if (!last) throw new Error('ERP not found');
  return { erp: last[c], label: `Damodaran implied ERP, end of ${last[0]}` };
}

/** 10-year par yield from the US Treasury's daily yield curve file (public domain). */
export async function treasuryGov10y(): Promise<{ rate: number; date: string; source: string }> {
  const y = new Date().getUTCFullYear();
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
  const lines = (await (await get(url)).text()).trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.replace(/"/g, ''));
  const c = header.indexOf('10 Yr');
  const row = lines[1]?.split(',');
  if (c < 0 || !row || !Number.isFinite(Number(row[c]))) throw new Error('10 Yr column not found');
  return { rate: Number(row[c]) / 100, date: isoFromUs(row[0]), source: 'US Treasury daily par yield curve' };
}

/** 10-year Treasury constant-maturity yield from FRED (public domain). */
export async function treasury10y(): Promise<{ rate: number; date: string; source: string }> {
  const txt = await (await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10')).text();
  const rows = txt.trim().split(/\r?\n/).slice(1).map((l) => l.split(',')).filter((r) => Number.isFinite(Number(r[1])) && r[1] !== '');
  const last = rows.at(-1);
  if (!last) throw new Error('No DGS10 rows');
  return { rate: Number(last[1]) / 100, date: last[0], source: 'FRED DGS10' };
}
