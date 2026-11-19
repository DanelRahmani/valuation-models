'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { defaultAssumptions, defaultBetaMethod, MIN_BETA_R2, MIN_INDUSTRY_FIRMS, type Assumptions, type Sources } from '@/lib/finance/assumptions';
import { evaluate, type ModelId } from '@/lib/finance/calcsheet';
import { extractHistoricals, type Basis } from '@/lib/finance/extract';
import { quickRun, runAll } from '@/lib/finance/run';
import { LINE_LABELS, type CompanyFile, type Historicals, type IndustryRow, type MarketFile, type SnapshotBeta } from '@/lib/finance/types';
import { fmt, fmtDate } from '@/lib/format';
import { MODEL_NOTES } from '@/content/modelNotes';
import { ModelCard } from './ModelCard';
import { FootballField, HistoryChart, SensitivityGrid, Tornado, type FieldRow } from './Charts';
import { Uncertainty } from './Uncertainty';
import { tornado, type TornadoInputs } from '@/lib/finance/uncertainty';
import { RandomCompanyButton } from './RandomCompany';
import { prettyName } from '@/lib/names';
import { BetaResult, BetaUpload, type UploadedBeta } from './BetaPanel';
import { Label, NumberField, ReadOnly } from './ui';
import { StoryMode, buildStory } from './StoryMode';
import { ValueCreation } from './ValueCreation';
import { Peers, usePeers, type PeerMultiples } from './Peers';
import { QaBadge } from './QaBadge';
import { SimpleView } from './SimpleView';
import { applyShare, decodeShare, encodeShare, type BetaChoice } from '@/lib/share';
import { ScenarioBanner, ScenariosTab, headlineId, leverText, useScenarioList } from './Scenarios';
import { applyScenario } from '@/lib/scenarios/apply';
import { storageKey } from '@/lib/scenarios/store';

type Tab = 'models' | 'scenarios' | 'value' | 'peers' | 'risk' | 'filings';

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
  // Switching between the trailing twelve months and the last fiscal year rebuilds the defaults; the link keeps any edits.
  return <Valuation key={loaded.ticker + loaded.h.cik + (params.get('basis') ?? '')} {...loaded} />;
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
  const params = useSearchParams();
  const router = useRouter();
  const basisWanted: Basis = params.get('basis') === 'fy' ? 'fy' : 'ttm';
  const switchBasis = (b: Basis) => {
    const p = new URLSearchParams(window.location.search);
    if (b === 'fy') p.set('basis', 'fy');
    else p.delete('basis');
    router.replace(`${window.location.pathname}?${p.toString()}`, { scroll: false });
  };
  const shared = useMemo(() => decodeShare(params), []); // eslint-disable-line react-hooks/exhaustive-deps
  const industries = market?.industries ?? [];
  const [industry, setIndustry] = useState<string>(company?.industry ?? '');
  const ind: IndustryRow | undefined = industries.find((i) => i.name === industry);
  const [uploaded, setUploaded] = useState<UploadedBeta | null>(null);
  const suggestedBeta = defaultBetaMethod(company?.beta ?? null, ind?.unleveredBeta != null && company?.price != null ? ind.firms : 0) as BetaChoice;
  const [betaChoice, setBetaChoice] = useState<BetaChoice>(() => shared.beta ?? suggestedBeta);
  const [simple, setSimple] = useState(!!shared.simple);
  const [tab, setTab] = useState<Tab>('models');
  const [story, setStory] = useState(false);
  const [peerSource, setPeerSource] = useState<'damodaran' | 'sp500'>('damodaran');

  const initial = useMemo(() => {
    const { a, src } = defaultAssumptions(h, {
      price: company?.price?.close ?? null,
      rf: market?.rf,
      erp: market?.erp,
      beta: company?.beta ?? null,
      industryBetaU: ind?.unleveredBeta ?? null,
      industryFirms: ind?.firms ?? null,
      subIndustry: company?.subIndustry ?? null,
      marketCap: company?.marketCap ?? null,
    }, basisWanted);
    if (company?.price) src.price = `Last close ${company.price.date} (Nasdaq)`;
    if (market) {
      src.rf = `10-year Treasury, ${market.rfDate} (${market.rfSource ?? 'FRED'})`;
      src.erp = market.erpSource;
    }
    if (ind) {
      a.peers = { pe: ind.pe, evEbitda: ind.evEbitda, evSales: ind.evSales, pb: ind.pb, peg: ind.peg, margin: ind.operatingMargin ?? null, roe: ind.roe ?? null };
      src.peers = `Damodaran industry average: ${ind.name}`;
    }
    return { a, src };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h]);

  const [a, setA] = useState<Assumptions>(() => applyShare(initial.a, shared));
  const [src, setSrc] = useState<Sources>(() => {
    const s2 = { ...initial.src };
    for (const k of Object.keys(shared.over)) (s2 as Record<string, string>)[k] = 'From the shared link';
    return s2;
  });
  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K], s = 'You') => {
    setA((p) => ({ ...p, [k]: v }));
    setSrc((p) => ({ ...p, [k]: s }));
  };

  // Beta follows the chosen method.
  const mcap = a.price != null && a.shares ? a.price * a.shares : null;
  const relevered = ind?.unleveredBeta != null && mcap ? ind.unleveredBeta * (1 + (1 - a.tax) * (a.debt / mcap)) : null;
  const firstBeta = useRef(true);
  useEffect(() => {
    const b = company?.beta;
    if (firstBeta.current && betaChoice === 'manual') return void (firstBeta.current = false);
    firstBeta.current = false;
    if (betaChoice === 'regression' && b) set('beta', b.beta, `Regression vs SPY, ${b.n} monthly returns (${b.source}, ${b.asOf})`);
    if (betaChoice === 'blume' && b) set('beta', b.blume, 'Blume-adjusted regression beta: 0.67β + 0.33');
    if (betaChoice === 'industry' && relevered != null) set('beta', relevered, `Damodaran ${industry} unlevered beta, relevered at this D/E`);
    if (betaChoice === 'upload' && uploaded) set('beta', uploaded.stats.beta, `Your upload: ${uploaded.stats.n} periods`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betaChoice, relevered, uploaded]);

  const peers = usePeers(ticker);
  const applyPeerMedians = (m: PeerMultiples) => {
    set('peers', { pe: m.pe, evEbitda: m.evEbitda, evSales: m.evSales, pb: m.pb, peg: a.peers.peg, margin: m.margin, roe: m.roe }, `Median of ${m.count} S&P 500 peers`);
    setPeerSource('sp500');
  };
  const applyDamodaran = () => {
    if (!ind) return;
    set('peers', { pe: ind.pe, evEbitda: ind.evEbitda, evSales: ind.evSales, pb: ind.pb, peg: ind.peg, margin: ind.operatingMargin ?? null, roe: ind.roe ?? null }, `Damodaran industry average: ${ind.name}`);
    setPeerSource('damodaran');
  };

  // Peer multiples follow the industry unless the user typed their own or chose S&P peers.
  useEffect(() => {
    if (!ind || (src.peers && src.peers === 'You') || peerSource === 'sp500') return;
    set('peers', { pe: ind.pe, evEbitda: ind.evEbitda, evSales: ind.evSales, pb: ind.pb, peg: ind.peg, margin: ind.operatingMargin ?? null, roe: ind.roe ?? null }, `Damodaran industry average: ${ind.name}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industry]);

  // Saved scenarios (this browser only). The page always opens on the base case; a scenario is on only when switched on.
  const scKey = storageKey(ticker, h.cik);
  const scStore = useScenarioList(scKey);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = scStore.list.find((s) => s.id === activeId) ?? null;
  const applied = useMemo(() => (active ? applyScenario(a, active) : null), [a, active]);
  /** The assumptions the page runs on: the base case, or the base case with the active scenario on top. */
  const aEff = applied?.a ?? a;

  const marginFromScenario = !!applied?.diffs.some((d) => d.lever === 'marginTarget' || d.lever === 'marginYears' || d.lever === 'shockMarginDrop');
  const out = useMemo(() => runAll(h, aEff, src, { marginFromScenario }), [h, aEff, src, marginFromScenario]);
  /** Base-case results, kept next to the scenario's so every card can show both. */
  const baseResults = useMemo(() => (active ? quickRun(h, a, src).results : out.results), [active, h, a, src, out]);
  const basePs = (id: ModelId) => baseResults.find((r) => r.id === id && r.status === 'ok')?.perShare ?? null;
  const I = out.values.inputs;
  const price = I.price ?? null;

  const field = useMemo(() => buildField(out, aEff), [out, aEff]);
  const storyData = useMemo(() => buildStory(prettyName(h.name), h, out), [h, out]);
  // Sensitivity of the headline model (FCFF, or residual income for banks), shared by the tornado and Monte Carlo.
  const tornadoInputs: TornadoInputs = useMemo(
    () => ({
      wacc: I.wacc ?? null,
      re: I.re ?? null,
      beta: aEff.beta,
      betaSe: betaChoice === 'regression' || betaChoice === 'blume' ? (company?.beta?.se ?? null) : null,
      g1: aEff.g1,
      gT: aEff.gT,
      marginTarget: aEff.marginTarget,
      capexPct: aEff.capexPct,
      nwcPct: aEff.nwcPct,
      tax: aEff.tax,
      roe: aEff.roe,
    }),
    [I.wacc, I.re, aEff, betaChoice, company],
  );
  const tornadoRows = useMemo(() => {
    const ok = out.results.find((r) => r.id === (a.financial ? 'ri' : 'fcff'))?.status === 'ok';
    return ok ? tornado(out.wb, tornadoInputs, a.financial) : [];
  }, [out, tornadoInputs, a.financial]);

  // Keep the address bar in step with the assumptions on screen, so the valuation can be shared (saved scenarios are not).
  const query = ticker
    ? encodeShare({ ticker, beta: betaChoice, defaultBeta: suggestedBeta, simple, a, defaults: initial.a, basis: h.ttm && basisWanted === 'fy' ? 'fy' : undefined })
    : '';
  useEffect(() => {
    if (!ticker) return;
    const url = `${window.location.pathname}?${query}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', url);
  }, [query, ticker]);
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  const [busy, setBusy] = useState(false);
  const exportXlsx = async () => {
    setBusy(true);
    try {
      const { exportWorkbook } = await import('@/lib/excel/export');
      // The workbook always opens on the base case; saved scenarios ride along behind a scenario switch.
      const baseOut = active ? runAll(h, a, src) : out;
      const blob = await exportWorkbook(ticker || h.name, h, baseOut, uploaded, { a, src, scenarios: scStore.list });
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
    ? ['scenarios', 'fcff', 'fcfe', 'apv', 'ri', 'multiples', 'total_payout', 'ddm_2stage', 'ddm_h', 'ddm_gordon']
    : ['fcff', 'fcfe', 'apv', 'ri', 'multiples', 'total_payout', 'ddm_gordon', 'ddm_2stage', 'ddm_h'];

  return (
    <div>
      <section className="relative pt-12">
        <div aria-hidden className="hero-vignette absolute inset-x-0 -top-10 bottom-0 lg:-inset-x-24" />
        <div className="relative grid gap-10 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Label>
                {ticker ? `${ticker} · ` : ''}CIK {h.cik} · {a.basis === 'ttm' && h.ttm ? `TTM to ${fmtDate(h.ttm.end)} (10-K + 10-Q)` : `FY${h.years.at(-1)} 10-K`}
                {company ? ` · ${company.sector}` : ''}
              </Label>
              <QaBadge ticker={ticker} />
            </div>
            <div className="mt-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted">Figures:</span>
                <div role="group" aria-label="Basis of the figures" className="inline-flex rounded-full border border-seam p-0.5">
                  {(
                    [
                      ['ttm', 'TTM · trailing 12 months (default)'],
                      ['fy', `10-K · fiscal year ${h.years.at(-1)}`],
                    ] as const
                  ).map(([b, label]) => (
                    <button
                      key={b}
                      type="button"
                      aria-pressed={a.basis === b}
                      disabled={b === 'ttm' && !h.ttm}
                      onClick={() => a.basis !== b && switchBasis(b)}
                      className={`rounded-full px-3 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${a.basis === b ? 'bg-accent text-bg' : 'text-muted hover:text-ink'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1.5 max-w-xl text-muted">
                {!h.ttm
                  ? h.ttmSkipped
                    ? `${h.ttmSkipped} The figures stay on the FY${h.years.at(-1)} 10-K.`
                    : `The latest filing is the FY${h.years.at(-1)} 10-K: there is no newer quarter yet, so the figures are the fiscal year.`
                  : a.basis === 'ttm'
                    ? `Trailing twelve months to ${fmtDate(h.ttm.end)}: the FY${h.years.at(-1)} 10-K plus the 10-Q year to date, minus the same period a year earlier, with balances from the 10-Q. This is how Yahoo Finance and Bloomberg report.`
                    : `Fiscal year ${h.years.at(-1)} as reported in the audited 10-K, ending ${fmtDate(h.yearEnds.at(-1)!)}. Newer quarters are left out.`}
              </p>
            </div>
            <h1 className="mt-4 font-serif text-5xl italic leading-[1.02] sm:text-6xl">{prettyName(h.name)}</h1>
            <div aria-hidden className="mt-5 h-px w-40 bg-accent/70" />
            <dl className="mt-8 flex flex-wrap gap-3">
              {(
                [
                  ['Share price', fmt(price, 'usd') || 'enter below'],
                  ['WACC', fmt(I.wacc, 'pct')],
                  ['Cost of equity', fmt(I.re, 'pct')],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-seam bg-panel/70 px-4 py-2.5">
                  <dt className="font-mono text-[0.6875rem] text-muted">{k}</dt>
                  <dd className="num text-xl">{v}</dd>
                </div>
              ))}
            </dl>
            <HeadlineBetas
              reg={company?.beta ?? null}
              industryName={industry}
              industryFirms={ind?.firms ?? null}
              relevered={relevered}
              choice={betaChoice}
              current={a.beta}
              suggested={defaultBetaMethod(company?.beta ?? null, ind?.unleveredBeta != null && company?.price != null ? ind.firms : 0)}
              onPick={setBetaChoice}
            />
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={exportXlsx}
                disabled={busy}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg shadow-[0_8px_24px_-8px_rgba(74,14,14,0.5)] transition-colors hover:bg-accent-hover"
              >
                {busy ? 'Building workbook…' : 'Download Excel model'}
              </button>
              <button
                type="button"
                onClick={() => setStory(true)}
                disabled={!storyData}
                title={storyData ? 'An animated walkthrough of the cash-flow valuation' : 'Needs a working FCFF model: not available for banks and insurers, or when FCFF is set aside for this company'}
                className="rounded-full border border-accent/50 px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-40"
              >
                Walk me through it
              </button>
              <RandomCompanyButton current={ticker} />
            </div>
          </div>
          <figure>
            <HistoryChart
              years={h.years.slice(-8)}
              revenue={(h.items.revenue ?? []).slice(-8).map((v) => v?.value ?? null)}
              fcf={h.years.slice(-8).map((_, i, arr) => {
                const k = h.years.length - arr.length + i;
                const cfo = h.items.cfo?.[k]?.value;
                const capex = h.items.capex?.[k]?.value;
                return cfo != null ? cfo - (capex ?? 0) : null;
              })}
            />
            <figcaption className="mt-1 flex gap-4 font-mono text-[0.6875rem] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-panel-strong ring-1 ring-[var(--seam)]" /> revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" /> free cash flow
              </span>
            </figcaption>
          </figure>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-y border-seam py-3">
        <div role="radiogroup" aria-label="View" className="inline-flex rounded-full border border-seam p-0.5 text-sm">
          {(
            [
              [true, 'Simple'],
              [false, 'Expert'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={simple === v}
              onClick={() => setSimple(v)}
              className={`rounded-full px-4 py-1 transition-colors ${simple === v ? 'bg-accent text-bg' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {ticker && (
            <Link className="link" href={`/compare/?t=${ticker}`}>
              Compare with…
            </Link>
          )}
          {ticker && (
            <button
              type="button"
              onClick={copyLink}
              className="link"
              aria-live="polite"
              title={active ? 'Share links carry the base case only; saved scenarios stay in this browser.' : undefined}
            >
              {copied ? 'Link copied' : active ? 'Copy link (base case)' : 'Copy link to this valuation'}
            </button>
          )}
        </div>
      </div>
      {active && applied && (
        <ScenarioBanner
          scenario={active}
          diffs={applied.diffs}
          notes={applied.notes}
          base={basePs(headlineId(a.financial))}
          value={out.results.find((r) => r.id === headlineId(a.financial) && r.status === 'ok')?.perShare ?? null}
          onBase={() => setActiveId(null)}
        />
      )}
      {simple ? (
        <SimpleView name={prettyName(h.name)} h={h} a={a} out={out} field={field} onExpert={() => setSimple(false)} />
      ) : (
        <>
      <section className="mt-12 rounded-[1.5rem] border border-seam bg-panel/70 px-6 py-6">
        <Label>Reverse DCF</Label>
        <p className="mt-3 font-serif text-2xl leading-snug sm:text-3xl">
          {out.reverse.growth != null && price != null ? (
            <>
              To justify {fmt(price, 'usd')}, revenue must grow about <span className="text-accent">{fmt(out.reverse.growth, 'pct')}</span> a year on average
              over the next five years, then fade to {fmt(aEff.gT, 'pct')},{' '}
              {aEff.adjust?.marginAdd || aEff.adjust?.marginSetW
                ? `on the scenario's margin path (target ${fmt(aEff.marginTarget, 'pct')}, plus its yearly changes)`
                : `at a ${fmt(aEff.marginTarget, 'pct')} operating margin`}
              . The model assumes {fmt(out.reverse.modelGrowth, 'pct')} on the {(aEff.growthMode ?? 'research') === 'research' ? 'research' : 'base-rate'} growth
              path{active ? ' with the scenario on' : ''}.
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

      <section className="mt-14">
        <h2 className="font-serif text-3xl">Where the methods land</h2>
        <p className="mt-1 text-sm text-muted">Cash-flow bars move the discount rate one point either way; the multiples bar runs from the lowest to the highest multiple. The tick is the central value.</p>
        <div className="mt-6">
          <FootballField rows={field} price={price} />
        </div>
      </section>

      <div role="tablist" aria-label="Sections" className="mt-14 flex gap-1 overflow-x-auto border-b border-seam">
        {(
          [
            ['models', 'Models'],
            ['scenarios', 'Scenarios'],
            ['value', 'Value creation'],
            ['peers', 'Peers'],
            ['risk', 'Uncertainty'],
            ['filings', 'Filings'],
          ] as [Tab, string][]
        )
          .filter(([k]) => k !== 'peers' || !!ticker)
          .map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`panel-${k}`}
              onClick={() => setTab(k)}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors ${
                tab === k ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-10">
        {tab === 'models' && (
      <div className="grid gap-12 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-2">
          <h2 className="font-serif text-2xl">Assumptions</h2>
          <p className="mt-1 text-xs text-muted">Every field shows where its value came from. Change anything; the models update as you type.</p>
          {active && applied && (
            <div className="mt-3 rounded border border-accent/50 bg-accent/5 px-3 py-2 text-xs">
              <span className="text-accent">Scenario &ldquo;{active.name}&rdquo; is on.</span> These fields are the base case; editing one changes the base, and the
              scenario applies on top.
              {applied.diffs.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-muted">
                  {applied.diffs.map((d) => (
                    <li key={d.lever}>
                      {d.label}: base {leverText(d.base, d.fmt)} → <span className="text-ink">{leverText(d.value, d.fmt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Group title="Market">
            <NumberField label="Share price" value={a.price} fmt="usd" source={src.price ?? 'You'} onChange={(v) => set('price', v)} />
            <NumberField label="Risk-free rate" value={a.rf} fmt="pct" source={src.rf} onChange={(v) => set('rf', v ?? 0)} />
            <NumberField label="Equity risk premium" value={a.erp} fmt="pct" source={src.erp} onChange={(v) => set('erp', v ?? 0)} />
          </Group>

          <Group title="Beta">
            <div role="radiogroup" aria-label="Beta method" className="space-y-1.5 py-2 text-sm">
              {(() => {
                const reg = company?.beta ?? null;
                const suggested = defaultBetaMethod(reg, ind?.unleveredBeta != null && company?.price != null ? ind.firms : 0);
                const weak = reg != null && reg.r2 < MIN_BETA_R2;
                const options: { k: BetaChoice; label: string; beta: number | null; detail: string; enabled: boolean }[] = [
                  {
                    k: 'regression',
                    label: 'Regression vs S&P 500',
                    beta: reg?.beta ?? null,
                    detail: reg
                      ? `R² ${reg.r2.toFixed(2)} · ${reg.n} months · 95% range ${(reg.beta - 1.96 * reg.se).toFixed(2)} to ${(reg.beta + 1.96 * reg.se).toFixed(2)}${weak ? ' · weak fit' : ''}`
                      : 'No price history',
                    enabled: !!reg,
                  },
                  { k: 'blume', label: 'Blume-adjusted regression', beta: reg?.blume ?? null, detail: '0.67 × regression + 0.33, pulled toward the market', enabled: !!reg },
                  {
                    k: 'industry',
                    label: industry ? `Industry: ${industry}` : 'Industry',
                    beta: relevered,
                    detail: ind ? `Damodaran, ${ind.firms} firms, relevered at this company's debt-to-equity${ind.firms < MIN_INDUSTRY_FIRMS ? ' · small sample' : ''}` : 'Pick an industry below',
                    enabled: relevered != null,
                  },
                  { k: 'upload', label: 'My price files', beta: uploaded?.stats.beta ?? null, detail: uploaded ? `R² ${uploaded.stats.r2.toFixed(2)} · ${uploaded.stats.n} periods` : 'Upload stock and index prices', enabled: true },
                  { k: 'manual', label: 'Type my own', beta: betaChoice === 'manual' ? a.beta : null, detail: 'Edit the levered beta below', enabled: true },
                ];
                return options.map((o) => {
                  const on = betaChoice === o.k;
                  return (
                    <button
                      key={o.k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!o.enabled}
                      onClick={() => setBetaChoice(o.k)}
                      className={`flex w-full items-start gap-3 rounded border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                        on ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.06)]' : 'border-seam hover:border-muted'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span>{o.label}</span>
                          {o.k === suggested && <span className="font-mono text-[0.625rem] uppercase tracking-wide text-[rgb(var(--accent))]">suggested</span>}
                        </span>
                        <span className="block font-mono text-[0.6875rem] text-muted">{o.detail}</span>
                      </span>
                      {o.beta != null && (
                        <span className="num shrink-0 text-right">
                          <span className="block">{o.beta.toFixed(2)}</span>
                          <span className="block font-mono text-[0.625rem] text-muted">re {((a.rf + o.beta * a.erp) * 100).toFixed(1)}%</span>
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
            <p className="pb-1 text-xs text-muted">
              Suggested: the Blume-adjusted regression when R² is at least {MIN_BETA_R2}, otherwise the industry beta (from {MIN_INDUSTRY_FIRMS}+ firms).
            </p>
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
            {a.financial ? (
              <p className="py-2 text-xs text-muted">
                Bank or insurer: valued on book equity and return on equity. The cash-flow fields below do not apply.
              </p>
            ) : (
              <label className="flex items-center justify-between py-2 text-sm">
                <span>Pre-profit / AI mode</span>
                <input type="checkbox" checked={a.aiMode} onChange={(e) => set('aiMode', e.target.checked)} className="accent-[rgb(var(--accent))]" />
              </label>
            )}
            <NumberField
              label={a.financial ? 'Book equity growth, years 1-5' : a.basis === 'ttm' ? 'Revenue growth, last 12 months' : 'Revenue growth, latest year'}
              value={a.g1}
              fmt="pct"
              source={src.g1}
              onChange={(v) => set('g1', v ?? 0)}
            />
            {!a.financial && (
              <>
                <label className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>Growth path</span>
                  <select
                    value={a.growthMode ?? 'research'}
                    onChange={(e) => set('growthMode', e.target.value as 'research' | 'base')}
                    className="rounded border border-seam bg-transparent px-2 py-1"
                  >
                    <option value="research">Research (McKinsey)</option>
                    <option value="base">Base rates (S&amp;P 500 backtest)</option>
                  </select>
                </label>
                <p className="-mt-1 pb-2 text-xs text-muted">
                  {(a.growthMode ?? 'research') === 'research'
                    ? 'In use: growth above a typical 6% keeps 70% of itself each year, the decay McKinsey observed in fast growers (about 8% after five years). Typical growth slides to terminal growth by year 10.'
                    : 'In use: measured on this site’s S&P 500 data, 2017-2025. Only 30% of growth above a typical 6% is left after a year; 20% lasts for years and fades out by year 10. Stricter than the research path.'}
                </p>
                {(a.growthMode ?? 'research') === 'research' ? (
                  <NumberField label="Excess growth kept each year" value={a.gDecay ?? 0.7} fmt="pct" source="McKinsey, Valuation" onChange={(v) => set('gDecay', v ?? 0.7)} />
                ) : (
                  <>
                    <NumberField label="Excess growth left after a year" value={a.gFade ?? 0.3} fmt="pct" source="S&P 500 backtest, 2017-2025" onChange={(v) => set('gFade', v ?? 0.3)} />
                    <NumberField label="Excess growth that lasts" value={a.gKeep ?? 0.2} fmt="pct" source="S&P 500 backtest, 2017-2025" onChange={(v) => set('gKeep', v ?? 0.2)} />
                  </>
                )}
                <NumberField label="Typical company growth" value={a.gTypical ?? 0.06} fmt="pct" source="Median S&P 500 revenue growth, 2017-2025" onChange={(v) => set('gTypical', v ?? 0.06)} />
              </>
            )}
            {a.financial && <NumberField label="Return on equity" value={a.roe} fmt="pct" source={src.roe} onChange={(v) => set('roe', v)} />}
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
                      ['g1', 'Revenue growth, latest year'],
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
            {ticker && (
              <div role="radiogroup" aria-label="Peer multiples source" className="mt-1 inline-flex rounded-full border border-seam p-0.5 text-xs">
                <button type="button" role="radio" aria-checked={peerSource === 'damodaran'} onClick={applyDamodaran} disabled={!ind} className={`rounded-full px-3 py-0.5 ${peerSource === 'damodaran' ? 'bg-accent text-bg' : 'text-muted'}`}>
                  Damodaran industry
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={peerSource === 'sp500'}
                  onClick={() => peers && applyPeerMedians(peers.multiples)}
                  disabled={!peers}
                  className={`rounded-full px-3 py-0.5 ${peerSource === 'sp500' ? 'bg-accent text-bg' : 'text-muted'}`}
                >
                  S&amp;P 500 peers
                </button>
              </div>
            )}
            <p className="mt-1 text-xs text-muted">{src.peers ?? 'Enter peer multiples, or pick an industry above.'}</p>
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

        <div className="min-w-0">
          {order.map((id) => {
            const r = byId(id);
            if (!r) return null;
            return (
              <ModelCard
                key={id}
                sheet={r.sheet}
                perShare={r.perShare}
                basePerShare={active ? basePs(id) : undefined}
                price={price}
                wb={out.wb}
                values={out.values}
                extra={
                  <>
                    {id === 'fcff' && out.sensitivity && (
                      <details className="mt-5">
                        <summary className="cursor-pointer text-sm text-accent">Sensitivity: WACC × terminal growth</summary>
                        <SensitivityGrid s={out.sensitivity} base={r.perShare} />
                      </details>
                    )}
                    {id === (a.financial ? 'ri' : 'fcff') && tornadoRows.length > 0 && r.perShare != null && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-accent">Which assumption matters most</summary>
                        <p className="mt-3 text-xs text-muted">
                          Each bar moves one input between a low and a high value with everything else held; the pale end is the low input. The solid line
                          is this model&apos;s value.
                        </p>
                        <div className="mt-3">
                          <Tornado rows={tornadoRows} base={r.perShare} price={price} />
                        </div>
                      </details>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      </div>
        )}
        {tab === 'scenarios' && (
          <ScenariosTab h={h} a={a} src={src} baseResults={baseResults} store={scStore} storeKey={scKey} activeId={activeId} onApply={setActiveId} />
        )}
        {tab === 'value' && <ValueCreation h={h} tax={a.tax} wacc={I.wacc ?? null} re={I.re ?? null} financial={a.financial} name={prettyName(h.name)} />}
        {tab === 'peers' && ticker && <Peers ticker={ticker} onUseMultiples={applyPeerMedians} usingPeers={peerSource === 'sp500'} />}
        {tab === 'risk' && (
          <Uncertainty
            wb={out.wb}
            h={h}
            inputs={tornadoInputs}
            financial={a.financial}
            price={price}
            base={byId(a.financial ? 'ri' : 'fcff')?.perShare ?? null}
            topDriver={tornadoRows[0] ?? null}
          />
        )}
        {tab === 'filings' && <HistoricalsTable h={h} />}
      </div>
        </>
      )}
      {storyData && <StoryMode story={storyData} open={story} onClose={() => setStory(false)} />}
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

/**
 * The three standard beta estimates side by side in the header, so the evidence behind the discount rate is
 * visible at a glance: the raw regression with its fit, the Blume adjustment, and the industry beta.
 */
function HeadlineBetas(p: {
  reg: SnapshotBeta | null;
  industryName: string;
  industryFirms: number | null;
  relevered: number | null;
  choice: BetaChoice;
  current: number;
  suggested: 'blume' | 'industry' | 'manual';
  onPick: (c: BetaChoice) => void;
}) {
  const weak = p.reg != null && p.reg.r2 < MIN_BETA_R2;
  const opts: { k: BetaChoice; label: string; beta: number | null; sub: string }[] = [
    { k: 'regression', label: 'Regression', beta: p.reg?.beta ?? null, sub: p.reg ? `R² ${p.reg.r2.toFixed(2)}${weak ? ', weak fit' : ''}` : 'no data' },
    { k: 'blume', label: 'Blume-adjusted', beta: p.reg?.blume ?? null, sub: '0.67β + 0.33' },
    { k: 'industry', label: 'Industry', beta: p.relevered, sub: p.industryFirms ? `${p.industryFirms} firms` : 'no industry' },
  ];
  const custom = p.choice === 'manual' || p.choice === 'upload';
  return (
    <div className="mt-3 rounded-2xl border border-seam bg-panel/70 px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[0.6875rem] text-muted">Beta</span>
        {custom && <span className="font-mono text-[0.6875rem] text-muted">using your {p.choice === 'upload' ? 'upload' : 'own'} value: {p.current.toFixed(2)}</span>}
      </div>
      <div role="radiogroup" aria-label="Beta estimate" className="mt-1.5 grid grid-cols-3 gap-2">
        {opts.map((o) => {
          const on = p.choice === o.k;
          return (
            <button
              key={o.k}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.beta == null}
              onClick={() => p.onPick(o.k)}
              title={o.k === 'industry' && p.industryName ? `Damodaran ${p.industryName}, relevered at this company's debt-to-equity` : undefined}
              className={`rounded-xl border px-2.5 py-1.5 text-left transition-colors disabled:opacity-40 ${
                on ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.07)]' : 'border-seam hover:border-muted'
              }`}
            >
              <span className="flex flex-wrap items-baseline gap-x-1 text-[0.6875rem] leading-tight">
                {o.label}
                {o.k === p.suggested && <span className="font-mono text-[0.5625rem] uppercase tracking-wide text-[rgb(var(--accent))]">suggested</span>}
              </span>
              <span className="num block text-lg leading-tight">{o.beta != null ? o.beta.toFixed(2) : '–'}</span>
              <span className="block font-mono text-[0.625rem] leading-tight text-muted">{o.sub}</span>
            </button>
          );
        })}
      </div>
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
    ['debt', 'Total debt'],
    ['equity', 'Book equity'],
  ];
  const yrs = h.years.slice(-5);
  return (
    <section>
      <h2 className="font-serif text-2xl">From the filings</h2>
      <p className="mt-1 text-xs text-muted">
        $ millions, fiscal years from 10-K filings{h.ttm ? `; the last column is the 12 months to ${fmtDate(h.ttm.end)} (10-K + 10-Q year to date - the same period a year earlier, balances from the 10-Q)` : ''}. Hover a number for its XBRL tag.
      </p>
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
              {h.ttm && <th className="px-2 py-1.5 text-right font-normal text-accent">TTM</th>}
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
                  {h.ttm &&
                    (() => {
                      const v = h.ttm.items[k];
                      return (
                        <td className="px-2 py-1.5 text-right text-accent" title={v ? `${v.tag}, period ending ${v.end}, filed ${v.filed}` : 'Not in the 10-Q data'}>
                          {v ? (v.value / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-'}
                        </td>
                      );
                    })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {h.missing.length > 0 && <p className="mt-2 text-xs text-muted">Not reported in the latest 10-K: {h.missing.map((k) => LINE_LABELS[k].toLowerCase()).join(', ')}.</p>}
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
  (['fcff', 'fcfe', 'apv', 'ri', 'total_payout'] as ModelId[]).forEach(add);
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
