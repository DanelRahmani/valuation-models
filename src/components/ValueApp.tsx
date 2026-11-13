'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { defaultAssumptions, type Assumptions, type Sources } from '@/lib/finance/assumptions';
import { evaluate, type ModelId } from '@/lib/finance/calcsheet';
import { extractHistoricals } from '@/lib/finance/extract';
import { runAll } from '@/lib/finance/run';
import type { CompanyFile, Historicals, IndustryRow, MarketFile, SnapshotBeta } from '@/lib/finance/types';
import { fmt } from '@/lib/format';
import { MODEL_NOTES } from '@/content/modelNotes';
import { ModelCard } from './ModelCard';
import { FootballField, SensitivityGrid, type FieldRow } from './Charts';
import { BetaResult, BetaUpload, type UploadedBeta } from './BetaPanel';
import { Badge, Label, NumberField, ReadOnly, Seam } from './ui';

type BetaChoice = 'regression' | 'blume' | 'industry' | 'manual' | 'upload';

interface Loaded {
  ticker: string;
  h: Historicals;
  company: CompanyFile | null;
  market: MarketFile | null;
}

export default function ValueApp() {
  const params = useSearchParams();
  const ticker = (params.get('t') ?? '').toUpperCase();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setError(null);
    (async () => {
      const market: MarketFile | null = await fetch('/data/market.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!ticker) {
        if (alive) setLoaded({ ticker: '', h: null as unknown as Historicals, company: null, market });
        return;
      }
      const r = await fetch(`/data/companies/${ticker}.json`);
      if (!r.ok) throw new Error(`${ticker} is not in the S&P 500 snapshot. Use "Any company" to upload its SEC file instead.`);
      const company: CompanyFile = await r.json();
      if (alive) setLoaded({ ticker, h: extractHistoricals(company.facts), company, market });
    })().catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [ticker]);

  if (error)
    return (
      <div className="py-24">
        <p className="text-lg">{error}</p>
        <Link href="/value/" className="link mt-4 inline-block">
          Upload a company file
        </Link>
      </div>
    );
  if (!loaded) return <p className="py-24 text-muted">Loading filings…</p>;
  if (!loaded.h) return <UploadCompany market={loaded.market} onLoaded={(h) => setLoaded({ ...loaded, h })} />;
  return <Valuation key={loaded.ticker + loaded.h.cik} {...loaded} />;
}

function UploadCompany({ market, onLoaded }: { market: MarketFile | null; onLoaded: (h: Historicals) => void }) {
  const [err, setErr] = useState<string | null>(null);
  void market;
  return (
    <section className="max-w-2xl py-12">
      <h1 className="font-serif text-4xl">Any SEC-filing company</h1>
      <p className="mt-4 text-muted">
        S&amp;P 500 companies load automatically from the search on the home page. For anything else, give me the company&apos;s SEC data file. It is read in
        your browser and never uploaded anywhere.
      </p>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm">
        <li>
          Find the company&apos;s CIK number on{' '}
          <a className="link" href="https://www.sec.gov/edgar/search/" target="_blank" rel="noreferrer">
            EDGAR search
          </a>
          .
        </li>
        <li>
          Open <span className="num text-[0.8125rem]">https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json</span> with the CIK padded to ten digits,
          and save the page (Ctrl+S or Cmd+S).
        </li>
        <li>Drop the file below.</li>
      </ol>
      <label className="mt-6 block cursor-pointer rounded border border-dashed border-seam px-4 py-8 text-center hover:border-accent">
        <span>Choose companyfacts JSON</span>
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={async (e) => {
            try {
              const f = e.target.files?.[0];
              if (!f) return;
              onLoaded(extractHistoricals(JSON.parse(await f.text())));
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        />
      </label>
      {err && <p className="mt-3 text-accent">{err}</p>}
    </section>
  );
}

const betaFrom = (u: UploadedBeta): SnapshotBeta => ({ ...u.stats, source: 'upload', asOf: new Date().toISOString().slice(0, 10) });

function Valuation({ ticker, h, company, market }: Loaded) {
  const industries = market?.industries ?? [];
  const [industry, setIndustry] = useState<string>(company?.industry ?? '');
  const ind: IndustryRow | undefined = industries.find((i) => i.name === industry);
  const [uploaded, setUploaded] = useState<UploadedBeta | null>(null);
  const [betaChoice, setBetaChoice] = useState<BetaChoice>(company?.beta ? 'regression' : ind ? 'industry' : 'manual');

  const initial = useMemo(() => {
    const { a, src } = defaultAssumptions(h, {
      price: company?.price?.close ?? null,
      rf: market?.rf,
      erp: market?.erp,
      beta: company?.beta ?? null,
      industryBetaU: ind?.unleveredBeta ?? null,
    });
    if (company?.price) src.price = `Last close ${company.price.date} (Nasdaq)`;
    if (market) {
      src.rf = `10-year Treasury, ${market.rfDate} (${market.rfSource ?? 'FRED'})`;
      src.erp = market.erpSource;
    }
    if (ind) {
      a.peers = { pe: ind.pe, evEbitda: ind.evEbitda, evSales: ind.evSales, pb: ind.pb, peg: ind.peg };
      src.peers = `Damodaran industry average: ${ind.name}`;
    }
    return { a, src };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h]);

  const [a, setA] = useState<Assumptions>(initial.a);
  const [src, setSrc] = useState<Sources>(initial.src);
  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K], s = 'You') => {
    setA((p) => ({ ...p, [k]: v }));
    setSrc((p) => ({ ...p, [k]: s }));
  };

  // Beta follows the chosen method.
  const mcap = a.price != null && a.shares ? a.price * a.shares : null;
  const relevered = ind?.unleveredBeta != null && mcap ? ind.unleveredBeta * (1 + (1 - a.tax) * (a.debt / mcap)) : null;
  useEffect(() => {
    const b = company?.beta;
    if (betaChoice === 'regression' && b) set('beta', b.beta, `Regression vs SPY, ${b.n} monthly returns (${b.source}, ${b.asOf})`);
    if (betaChoice === 'blume' && b) set('beta', b.blume, 'Blume-adjusted regression beta: 0.67β + 0.33');
    if (betaChoice === 'industry' && relevered != null) set('beta', relevered, `Damodaran ${industry} unlevered beta, relevered at this D/E`);
    if (betaChoice === 'upload' && uploaded) set('beta', uploaded.stats.beta, `Your upload: ${uploaded.stats.n} periods`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betaChoice, relevered, uploaded]);

  // Peer multiples follow the industry unless the user typed their own.
  useEffect(() => {
    if (!ind || (src.peers && src.peers === 'You')) return;
    set('peers', { pe: ind.pe, evEbitda: ind.evEbitda, evSales: ind.evSales, pb: ind.pb, peg: ind.peg }, `Damodaran industry average: ${ind.name}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industry]);

  const out = useMemo(() => runAll(h, a, src), [h, a, src]);
  const I = out.values.inputs;
  const price = I.price ?? null;

  const field = useMemo(() => buildField(out, a), [out, a]);
  const [busy, setBusy] = useState(false);
  const exportXlsx = async () => {
    setBusy(true);
    try {
      const { exportWorkbook } = await import('@/lib/excel/export');
      const blob = await exportWorkbook(ticker || h.name, h, out, uploaded);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${ticker || 'company'}-valuation-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const byId = (id: ModelId) => out.results.find((r) => r.id === id);
  const order: ModelId[] = a.aiMode
    ? ['scenarios', 'fcff', 'fcfe', 'apv', 'ri', 'multiples', 'ddm_2stage', 'ddm_h', 'ddm_gordon']
    : ['fcff', 'fcfe', 'apv', 'ri', 'multiples', 'ddm_gordon', 'ddm_2stage', 'ddm_h'];

  return (
    <div>
      <section className="pt-8">
        <Label>
          {ticker ? `${ticker} · ` : ''}CIK {h.cik} · FY{h.years.at(-1)} 10-K{company ? ` · ${company.sector}` : ''}
        </Label>
        <h1 className="mt-3 font-serif text-4xl sm:text-5xl">{titleCase(h.name)}</h1>
        <div className="mt-6 flex flex-wrap items-end gap-x-12 gap-y-4">
          <div>
            <Label>Share price</Label>
            <div className="num text-2xl">{fmt(price, 'usd') || 'enter below'}</div>
          </div>
          <div>
            <Label>WACC</Label>
            <div className="num text-2xl">{fmt(I.wacc, 'pct')}</div>
          </div>
          <div>
            <Label>Cost of equity</Label>
            <div className="num text-2xl">{fmt(I.re, 'pct')}</div>
          </div>
          <div className="ml-auto flex gap-3">
            <button type="button" onClick={exportXlsx} disabled={busy} className="rounded bg-accent px-4 py-2 text-sm text-bg transition-colors hover:bg-accent-hover">
              {busy ? 'Building workbook…' : 'Download Excel (live formulas)'}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-10 rounded border border-seam bg-panel/50 px-5 py-5">
        <Label>Reverse DCF</Label>
        <p className="mt-2 font-serif text-2xl leading-snug">
          {out.reverse.growth != null && price != null ? (
            <>
              To justify {fmt(price, 'usd')}, revenue must grow about <span className="text-accent">{fmt(out.reverse.growth, 'pct')}</span> a year for five
              years, then fade to {fmt(a.gT, 'pct')}, at a {fmt(a.marginTarget, 'pct')} operating margin.
            </>
          ) : (
            out.reverse.message
          )}
        </p>
        {out.warnings.map((w) => (
          <p key={w} className="mt-2 text-sm text-muted">
            {w}
          </p>
        ))}
      </section>

      <section className="mt-10">
        <FootballField rows={field} price={price} />
      </section>

      <div className="mt-12 grid gap-12 lg:grid-cols-[340px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-2">
          <h2 className="font-serif text-2xl">Assumptions</h2>
          <p className="mt-1 text-xs text-muted">Every field shows where its value came from. Change anything; the models update as you type.</p>

          <Group title="Market">
            <NumberField label="Share price" value={a.price} fmt="usd" source={src.price ?? 'You'} onChange={(v) => set('price', v)} />
            <NumberField label="Risk-free rate" value={a.rf} fmt="pct" source={src.rf} onChange={(v) => set('rf', v ?? 0)} />
            <NumberField label="Equity risk premium" value={a.erp} fmt="pct" source={src.erp} onChange={(v) => set('erp', v ?? 0)} />
          </Group>

          <Group title="Beta">
            <div className="space-y-1 py-2 text-sm">
              {(
                [
                  ['regression', `Regression (${company?.beta ? company.beta.beta.toFixed(2) : 'n/a'})`, !!company?.beta],
                  ['blume', `Blume-adjusted (${company?.beta ? company.beta.blume.toFixed(2) : 'n/a'})`, !!company?.beta],
                  ['industry', `Industry, relevered (${relevered != null ? relevered.toFixed(2) : 'n/a'})`, relevered != null],
                  ['upload', `My price files${uploaded ? ` (${uploaded.stats.beta.toFixed(2)})` : ''}`, true],
                  ['manual', 'Type my own', true],
                ] as [BetaChoice, string, boolean][]
              ).map(([k, label, enabled]) => (
                <label key={k} className={`flex items-center gap-2 ${enabled ? '' : 'opacity-40'}`}>
                  <input type="radio" name="beta" checked={betaChoice === k} disabled={!enabled} onChange={() => setBetaChoice(k)} className="accent-[rgb(var(--accent))]" />
                  {label}
                </label>
              ))}
            </div>
            {company?.beta && (
              <p className="font-mono text-[0.6875rem] text-muted">
                Regression: R² {company.beta.r2.toFixed(2)}, 95% interval {(company.beta.beta - 1.96 * company.beta.se).toFixed(2)} to{' '}
                {(company.beta.beta + 1.96 * company.beta.se).toFixed(2)}
                {company.beta.r2 < 0.2 ? '. Weak fit: the industry beta is usually the better estimate.' : ''}
              </p>
            )}
            <NumberField label="Levered beta" value={a.beta} fmt="beta" source={src.beta} onChange={(v) => (setBetaChoice('manual'), set('beta', v ?? 1))} step={0.01} />
            <label className="block py-2 text-sm">
              <span>Damodaran industry</span>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="mt-1 w-full rounded border border-seam bg-transparent px-2 py-1">
                <option value="">None</option>
                {industries.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            {betaChoice === 'upload' && <BetaUpload ticker={ticker} onBeta={(b) => setUploaded(b)} />}
            {uploaded && betaChoice === 'upload' && <BetaResult b={uploaded} />}
          </Group>

          <Group title="Cost of capital">
            <NumberField label="Tax rate" value={a.tax} fmt="pct" source={src.tax} onChange={(v) => set('tax', v ?? 0)} />
            <NumberField label="Pre-tax cost of debt" value={a.rd} fmt="pct" source={src.rd} onChange={(v) => set('rd', v ?? 0)} />
            <ReadOnly label="Cost of equity" value={I.re} f="pct" note="rf + β × ERP" />
            <ReadOnly label="Debt weight" value={I.w_debt} f="pct" />
            <ReadOnly label="WACC" value={I.wacc} f="pct" />
            <ReadOnly label="Unlevered cost of equity" value={I.ru} f="pct" note="for APV" />
          </Group>

          <Group title="Forecast">
            <label className="flex items-center justify-between py-2 text-sm">
              <span>Pre-profit / AI mode</span>
              <input type="checkbox" checked={a.aiMode} onChange={(e) => set('aiMode', e.target.checked)} className="accent-[rgb(var(--accent))]" />
            </label>
            <NumberField label="Revenue growth, years 1-5" value={a.g1} fmt="pct" source={src.g1} onChange={(v) => set('g1', v ?? 0)} />
            <NumberField label="Terminal growth" value={a.gT} fmt="pct" source={src.gT} onChange={(v) => set('gT', v ?? 0)} />
            <NumberField label="Operating margin, target" value={a.marginTarget} fmt="pct" source={src.marginTarget} onChange={(v) => set('marginTarget', v)} />
            <NumberField label="Years to reach target" value={a.marginYears} fmt="num" source="Default 5" onChange={(v) => set('marginYears', v ?? 5)} step={1} />
            <NumberField label="Capex, % of revenue" value={a.capexPct} fmt="pct" source={src.capexPct} onChange={(v) => set('capexPct', v ?? 0)} />
            <NumberField label="D&A, % of revenue" value={a.daPct} fmt="pct" source={src.daPct} onChange={(v) => set('daPct', v ?? 0)} />
            <NumberField label="Working capital, % of new revenue" value={a.nwcPct} fmt="pct" source={src.nwcPct} onChange={(v) => set('nwcPct', v ?? 0)} />
            <label className="flex items-center justify-between py-2 text-sm">
              <span>Terminal value</span>
              <select value={a.terminalMethod} onChange={(e) => set('terminalMethod', e.target.value as 'gordon' | 'exit')} className="rounded border border-seam bg-transparent px-2 py-1">
                <option value="gordon">Gordon growth</option>
                <option value="exit">Exit multiple</option>
              </select>
            </label>
            {a.terminalMethod === 'exit' && (
              <NumberField label="Exit EV/EBITDA" value={a.exitMultiple} fmt="x" source={src.exitMultiple} onChange={(v) => set('exitMultiple', v ?? 10)} />
            )}
          </Group>

          {a.aiMode && (
            <Group title="Scenarios">
              <NumberField label="New shares from conversions, SBC (M)" value={a.newShares} fmt="shares" source="You" onChange={(v) => set('newShares', v ?? 0)} />
              {(['bear', 'base', 'bull'] as const).map((k) => (
                <div key={k} className="mt-2 border-t border-seam pt-2">
                  <Label>{k} case</Label>
                  {(
                    [
                      ['g1', 'Growth, years 1-5'],
                      ['margin', 'Target margin'],
                      ['capexPct', 'Capex, % of revenue'],
                      ['prob', 'Probability'],
                    ] as const
                  ).map(([f, label]) => (
                    <NumberField
                      key={f}
                      label={label}
                      value={a.scenarios[k][f]}
                      fmt="pct"
                      onChange={(v) => set('scenarios', { ...a.scenarios, [k]: { ...a.scenarios[k], [f]: v ?? 0 } })}
                    />
                  ))}
                </div>
              ))}
            </Group>
          )}

          <Group title="Peer multiples">
            <p className="text-xs text-muted">{src.peers ?? 'Enter peer multiples, or pick an industry above.'}</p>
            {(
              [
                ['pe', 'P/E'],
                ['evEbitda', 'EV/EBITDA'],
                ['evSales', 'EV/Sales'],
                ['pb', 'P/B'],
                ['peg', 'PEG'],
              ] as const
            ).map(([k, label]) => (
              <NumberField key={k} label={label} value={a.peers[k]} fmt="x" onChange={(v) => set('peers', { ...a.peers, [k]: v })} />
            ))}
          </Group>
        </aside>

        <div>
          {order.map((id) => {
            const r = byId(id);
            if (!r) return null;
            return (
              <ModelCard
                key={id}
                sheet={r.sheet}
                perShare={r.perShare}
                price={price}
                wb={out.wb}
                values={out.values}
                extra={
                  id === 'fcff' && out.sensitivity ? (
                    <details className="mt-5">
                      <summary className="cursor-pointer text-sm text-accent">Sensitivity: WACC × terminal growth</summary>
                      <SensitivityGrid s={out.sensitivity} base={r.perShare} />
                    </details>
                  ) : null
                }
              />
            );
          })}
          <Seam />
          <HistoricalsTable h={h} />
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t border-seam pt-3">
      <Label>{title}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function HistoricalsTable({ h }: { h: Historicals }) {
  const rows: [keyof Historicals['items'], string][] = [
    ['revenue', 'Revenue'],
    ['operatingIncome', 'Operating income'],
    ['netIncome', 'Net income'],
    ['cfo', 'Cash from operations'],
    ['capex', 'Capital expenditure'],
    ['da', 'Depreciation & amortisation'],
    ['dividendsPaid', 'Dividends paid'],
    ['buybacks', 'Share buybacks'],
    ['cash', 'Cash'],
    ['shortTermInvestments', 'Short-term investments'],
    ['debtNoncurrent', 'Debt, noncurrent'],
    ['equity', 'Book equity'],
  ];
  const yrs = h.years.slice(-5);
  return (
    <section>
      <h2 className="font-serif text-2xl">From the filings</h2>
      <p className="mt-1 text-xs text-muted">$ millions, fiscal years from 10-K filings. Hover a number for its XBRL tag.</p>
      <div className="overflow-x-auto">
        <table className="num mt-4 w-full min-w-[560px] text-[0.8125rem]">
          <thead>
            <tr className="border-b border-seam text-muted">
              <th />
              {yrs.map((y) => (
                <th key={y} className="px-2 py-1.5 text-right font-normal">
                  FY{y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, label]) => {
              const arr = (h.items[k] ?? []).slice(-5);
              return (
                <tr key={k} className="border-b border-seam/60">
                  <td className="py-1.5 pr-4 font-sans">{label}</td>
                  {arr.map((v, i) => (
                    <td key={i} className="px-2 py-1.5 text-right" title={v ? `${v.tag}, period ending ${v.end}, filed ${v.filed}` : 'Not reported'}>
                      {v ? (v.value / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {h.missing.length > 0 && <p className="mt-2 text-xs text-muted">Not reported in the latest 10-K: {h.missing.join(', ')}.</p>}
    </section>
  );
}

function buildField(out: ReturnType<typeof runAll>, a: Assumptions): FieldRow[] {
  const ok = (id: ModelId) => out.results.find((r) => r.id === id && r.status === 'ok' && r.perShare != null);
  const I = out.values.inputs;
  const shift = (d: number) =>
    evaluate(out.wb, {
      ...(I.wacc != null ? { wacc: I.wacc + d } : {}),
      ...(I.re != null ? { re: I.re + d } : {}),
      ...(I.ru != null ? { ru: I.ru + d } : {}),
    });
  const hi = shift(-0.01);
  const lo = shift(0.01);
  const rows: FieldRow[] = [];
  const add = (id: ModelId) => {
    const r = ok(id);
    if (!r) return;
    const s = r.sheet;
    const pick = (v: typeof hi) => v.sheets[s.name][s.result.row]?.[s.result.col] ?? r.perShare!;
    const vals = [pick(lo), pick(hi), r.perShare!].filter((x) => Number.isFinite(x) && x > 0);
    if (!vals.length) return;
    rows.push({ label: MODEL_NOTES[id]?.short ?? s.title, low: Math.min(...vals), high: Math.max(...vals), point: r.perShare! });
  };
  if (a.aiMode) {
    const sc = ok('scenarios');
    if (sc) {
      const v = out.values.sheets.Scenarios;
      const cases = [v.bear[0], v.base[0], v.bull[0]].filter((x): x is number => x != null);
      rows.push({ label: 'Scenarios', low: Math.min(...cases), high: Math.max(...cases), point: sc.perShare! });
    }
  }
  (['fcff', 'fcfe', 'apv', 'ri'] as ModelId[]).forEach(add);
  const m = ok('multiples');
  if (m) {
    const v = out.values.sheets.Multiples;
    const imp = ['pe', 'ev_ebitda', 'ev_sales', 'pb', 'peg'].map((k) => v[k]?.[2]).filter((x): x is number => x != null && x > 0);
    if (imp.length) rows.push({ label: 'Multiples', low: Math.min(...imp), high: Math.max(...imp), point: m.perShare! });
  }
  const ddm = (['ddm_gordon', 'ddm_2stage', 'ddm_h'] as ModelId[]).map(ok).filter(Boolean);
  if (ddm.length) {
    const v = ddm.map((r) => r!.perShare!);
    rows.push({ label: 'Dividend models', low: Math.min(...v), high: Math.max(...v), point: ok('ddm_2stage')?.perShare ?? v[0] });
  }
  return rows;
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Corp|Inc|Co|Ltd|Plc)\b/g, (w) => w)
    .replace(/\bNvidia\b/, 'NVIDIA');
