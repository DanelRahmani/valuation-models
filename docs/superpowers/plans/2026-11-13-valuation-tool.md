# Valuation Models Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native: the main session implements everything; Haiku writes the two tests in Task 8). Steps use checkbox (`- [ ]`) syntax.

**Goal:** A static Next.js site. You type an S&P 500 ticker (or upload any SEC companyfacts file) and get DDM, FCFF, FCFE, APV, residual income, multiples and reverse DCF valuations. Every calculation is visible, and there's an Excel export with live formulas. A monthly GitHub Action keeps the data fresh.

**Architecture:**
- All finance math lives in `src/lib/finance/`. It is pure TypeScript, shared by the site and the Node snapshot script.
- Each model returns a `CalcSheet`: labelled rows of cells, each carrying `value` and an Excel `formula`. The UI "show calculations" view and the ExcelJS export both render that one structure, so they can't drift apart.
- Data is static JSON in `public/data/`. It is written by `scripts/snapshot.ts`, which runs in `.github/workflows/snapshot.yml`.

**Tech Stack:** Next.js 16 (`output: 'export'`), React 18, TypeScript, Tailwind 3, ExcelJS, fflate (unzip in Node), tsx (run scripts), Vitest (2 tests only).

**Spec:** `docs/superpowers/specs/2026-11-13-valuation-tool-design.md`

## Global Constraints

- No server functions, no API routes, no runtime API keys, no analytics, no cookies.
- Never show buy/sell language or green/red value signals.
- Raw price data is never committed or shipped. Only beta statistics are.
- Visual identity follows the personal site's `DESIGN.md`:
  - Colors: creme `#FDFBF6`, aubergine `#0F090E`, maroon `#4A0E0E`, raspberry `#D43D55`, ink `#1C1917`, muted `#57534E`.
  - Fonts: Bodoni Moda, Geist Sans, Geist Mono.
  - No em/en dashes in visible copy, no emoji.
- At most 2 tests in the whole repo (Task 8). No extra lint or type gates beyond `next build`.
- SEC requests use the `User-Agent` from the env var `SEC_USER_AGENT`. It is never hard-coded.
- The terminal growth rate is capped at the risk-free rate, with a visible warning.

## Review Focus

1. **A company is missing a tag** (e.g. no dividends, no debt). The field is left empty and flagged, the affected models show "needs input", and nothing crashes or shows NaN. Owner: Task 2 / Task 6.
2. **Negative or zero earnings and cash flow** (pre-profit companies). Gordon/DDM report "not applicable", P/E is skipped, and the DCF still runs. Owner: Task 3.
3. **Discount rate ≤ growth rate.** Gordon/terminal value refuses to calculate with a clear message instead of a negative or infinite value. Owner: Task 3.
4. **A partial snapshot run** (SEC or prices down). Previous data is kept, nothing is committed if more than 5% fail, and an issue is opened. Owner: Task 7.
5. **Fiscal years not on a calendar year** (NVDA ends in January). Years are labelled by fiscal year end and the latest 10-K is used. Owner: Task 2.

---

### Task 1: Scaffold + design tokens

**Files:** create `package.json`, `next.config.mjs` (`output: 'export'`, `images.unoptimized`), `tailwind.config.ts`, `postcss.config.js`, `tsconfig.json`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (placeholder), `README.md` (stub).

- [ ] Add Tailwind color tokens (`bg`, `ink`, `muted`, `accent`, `accent-hover`, `seam`, with dark variants per DESIGN.md) and the fonts: Bodoni Moda via `next/font/google`, and Geist via the `geist` package.
- [ ] Run `npm run build`. Expected: `out/` is produced with no errors.
- [ ] Commit "chore: scaffold static Next.js site".

### Task 2: Types + companyfacts extraction

**Files:** create `src/lib/finance/types.ts` and `src/lib/finance/extract.ts`.

**Interfaces:**
- Produces:
  - `type LineItem = 'revenue'|'cogs'|'operatingIncome'|'da'|'interestExpense'|'pretaxIncome'|'taxExpense'|'netIncome'|'cfo'|'capex'|'dividendsPaid'|'cash'|'debtCurrent'|'debtNoncurrent'|'equity'|'sharesOutstanding'|'dilutedShares'|'sbc'`
  - `interface FactValue { value: number; tag: string; fy: number; end: string; filed: string }`
  - `interface Historicals { cik: string; name: string; years: number[]; items: Partial<Record<LineItem, (FactValue|null)[]>>; missing: LineItem[] }`
  - `extractHistoricals(companyfacts: unknown, nYears = 10): Historicals`
  - `trimCompanyfacts(companyfacts: unknown): TrimmedFacts`, which keeps only the mapped tags with 10-K/FY rows. The snapshot uses it, and `extractHistoricals` accepts both the full and the trimmed shape.
  - `TAG_MAP: Record<LineItem, string[]>`, ordered fallback tags. For example, revenue is `Revenues`, then `RevenueFromContractWithCustomerExcludingAssessedTax`, then `SalesRevenueNet`.
- Rules:
  - Annual means `form` starts with `10-K` and `fp === 'FY'`.
  - The period must be about 12 months (duration 350–380 days) for flow items. Instant items take the value at FY end.
  - Duplicates are resolved by the latest `filed`.
  - `fy` is taken from the `end` date's fiscal year, not the `fy` field, because the `fy` field repeats prior-year comparatives.
- [ ] Verify with the scratch script `scripts/dev/extract-check.ts` on NVIDIA's companyfacts. The FY2025 (ending Jan 2025) revenue must equal 130,497 $M as reported in the 10-K.
- [ ] Commit.

### Task 3: Valuation engine

**Files:** create in `src/lib/finance/`:

| File | Contents |
|---|---|
| `calcsheet.ts` | `CalcSheet` + builder |
| `capm.ts` | Beta regression, CAPM, WACC |
| `drivers.ts` | Default forecast drivers from historicals |
| `models/ddm.ts` | Dividend discount models |
| `models/fcff.ts` | FCFF DCF |
| `models/fcfe.ts` | FCFE DCF |
| `models/apv.ts` | APV |
| `models/residualIncome.ts` | Residual income |
| `models/multiples.ts` | Multiples |
| `models/reverseDcf.ts` | Reverse DCF |
| `models/scenarios.ts` | Pre-profit / AI mode |
| `run.ts` | Runs all models |

**Interfaces (produced):**
- `interface Cell { value: number|null; formula?: string; fmt?: 'usd'|'pct'|'x'|'num' }`
- `interface CalcRow { key: string; label: string; cells: Cell[]; note?: string }`
- `interface CalcSheet { id: ModelId; title: string; columns: string[]; rows: CalcRow[]; result: { perShare: number|null; equityValue: number|null; status: 'ok'|'na'|'needs-input'; message?: string } }`
- Formulas reference named cells on the `Inputs` sheet (e.g. `Inputs!rf`) and same-sheet A1 refs. The builder assigns row and column positions so the formulas are correct.
- `regressBeta(stock: {date:string;close:number}[], market: same, freq: 'monthly'|'weekly'): { beta, alpha, r2, se, n, blume }` uses month-end alignment and simple returns.
- `relever(unleveredBeta, de, tax)` and `unlever(beta, de, tax)` use Hamada.
- `costOfEquity(rf, beta, erp)`, `wacc({E, D, re, rd, tax})`.
- `interface Assumptions { rf; erp; beta; betaSource: 'regression'|'industry'|'manual'; rd; tax; price; years: number; growth: {stage1; terminal}; ebitMargin; capexPct; daPct; nwcPct; payout; exitMultiple?; terminalMethod: 'gordon'|'exit'; peers: Partial<Record<'pe'|'evEbitda'|'evSales'|'pb'|'peg', number>> }`
- `defaultAssumptions(h: Historicals, market: {price?: number; rf?: number; beta?: BetaStats}): Assumptions`. Margins and percentages are 3-year averages, growth is the 3-year revenue CAGR faded linearly to terminal, terminal defaults to min(2.5%, rf), and ERP defaults to the value in `public/data/market.json`.
- Each model: `(h: Historicals, a: Assumptions) => CalcSheet`, plus `runAll(h, a): CalcSheet[]`.

**Model formulas (pinned):**

| Model | Formula |
|---|---|
| Gordon | V0 = D1/(re−g) |
| 2-stage DDM | Explicit dividends + PV(Gordon at N) |
| H-model | V0 = D0(1+gL)/(r−gL) + D0·H·(gS−gL)/(r−gL) |
| FCFF | EBIT(1−t) + D&A − capex − ΔNWC, discounted at WACC; EV − net debt = equity |
| FCFE | FCFF − interest(1−t) + net borrowing (net borrowing holds D/E constant), discounted at re |
| APV | Unlevered value at ru (ru from the unlevered beta) + PV of tax shields (t·rd·D discounted at rd) |
| Residual income | B0 + Σ (NI_t − re·B_{t−1})/(1+re)^t + terminal |
| Multiples | Peer multiple × company metric, skipping any with a negative base |
| Reverse DCF | Bisection on stage-1 growth so the FCFF value per share equals the price (bounds −50%…+100%; report "no solution" outside them) |
| Scenarios | Bear, base and bull assumption overrides with probabilities summing to 1; weighted value; dilution (`newShares`) and SBC inputs |

- [ ] Hand-check: Gordon with D1=2, re=10%, g=4% must give 33.33. Check it in a scratch script; Task 8 makes it a real test.
- [ ] Commit.

### Task 4: Price CSV parser + Damodaran/market data loaders

**Files:** create `src/lib/finance/prices.ts`.

- [ ] `parsePriceCsv(text: string): {date: string; close: number}[]`:
  - Accepts Nasdaq (`Date,Close/Last,…`, MM/DD/YYYY, optional `$`), Yahoo (`Date,…,Adj Close`, which it prefers), and generic `Date,Close`.
  - Sorted ascending. Throws a readable error on an unknown header.
- [ ] Verify on the two downloaded Nasdaq files. Expected: NVDA vs SPY monthly beta ≈ 2.24.
- [ ] Commit.

### Task 5: Snapshot script (local run first)

**Files:** create `scripts/snapshot.ts`, `scripts/snapshot/sec.ts`, `scripts/snapshot/sp500.ts`, `scripts/snapshot/prices.ts`, `scripts/snapshot/damodaran.ts`.

**Interfaces:**
- Consumes: `trimCompanyfacts`, `extractHistoricals`, `regressBeta`.
- Produces these files:

| File | Contents |
|---|---|
| `public/data/index.json` | `{ asOf, companies: [{ticker, name, cik, sector, subIndustry}] }` |
| `public/data/companies/{T}.json` | `{ ticker, cik, name, sector, facts: TrimmedFacts, beta: BetaStats & {source:'nasdaq'|'yahoo'|'previous', asOf} \| null }` |
| `public/data/market.json` | `{ asOf, erp, damodaranIndustries: {name, unleveredBeta}[] }` |

Behavior:
- **S&P 500 list:** `https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv`. On failure, keep the existing list.
- **Ticker → CIK:** `https://www.sec.gov/files/company_tickers.json`.
- **SEC:**
  - Stream-download `companyfacts.zip` to a temp file and unzip only the needed `CIK##########.json` entries (fflate `Unzip`, streaming, to keep memory low).
  - If the bulk download fails, fall back to per-CIK `data.sec.gov` requests at 5 req/s.
- **Prices:**
  - Nasdaq: `https://api.nasdaq.com/api/quote/{T}/historical?assetclass=stocks&fromdate={-5y}&todate={today}&limit=9999` (SPY uses `assetclass=etf`) with a browser-like UA.
  - Fallback: Yahoo `https://query1.finance.yahoo.com/v8/finance/chart/{T}?range=5y&interval=1mo`.
  - Concurrency 2, retry 3× with backoff. Only `BetaStats` are written.
- **ERP and industry betas:**
  - ERP: parse Damodaran's current implied ERP (`https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/implpr.html`). On failure, keep the previous value.
  - Industry betas: `https://pages.stern.nyu.edu/~adamodar/pc/datasets/betas.xls`, parsed with ExcelJS or SheetJS. Keep the previous values on failure.
- **Failure rule:** if more than 5% of tickers fail fundamentals, or more than 25% fail prices without a previous value, exit code 1 and write nothing.
- **Flags:** `--only NVDA,AAPL` and `--skip-prices`, for local runs.
- [ ] Run locally: `SEC_USER_AGENT="…" npx tsx scripts/snapshot.ts --only NVDA,AAPL,KO,JPM`. Expected: 4 company files plus the index, with NVDA's beta near 2.2.
- [ ] Record the real file sizes in the README.
- [ ] Commit the script and the 4-company data.

### Task 6: UI

**Files:** create `src/app/page.tsx` (search plus "Try NVIDIA"), `src/app/value/page.tsx` (client page that reads `?t=` or uploaded files), `src/app/methodology/page.tsx`, and `src/components/` (`TickerSearch`, `UploadPanel`, `AssumptionsPanel`, `FootballField`, `ModelCard`, `CalcTable`, `SensitivityGrid`, `BetaPanel` with an SVG scatter, `Disclaimer`, `DataAsOf`). Also `src/content/modelNotes.ts`, which holds "best for", "watch out" and "does this survive AI?" per model.

- [ ] Value page:
  - Assumptions on the left, with a source badge per field (filing tag / snapshot / default / you).
  - Football field on top, then one card per model.
  - Each card's "Show calculations" toggle renders its `CalcTable` with formulas on hover.
- [ ] Sensitivity grid for FCFF: WACC ±2% in 0.5% steps × terminal g ±1% in 0.5% steps.
- [ ] Pre-profit toggle swaps FCFF for the scenarios view and headlines the reverse DCF sentence.
- [ ] Missing data shows "needs input" chips, never NaN.
- [ ] Run `npm run build`, then visually check `npx serve out` in the browser pane with NVDA, KO and JPM.
- [ ] Commit.

### Task 7: Excel export + GitHub Action

**Files:** create `src/lib/excel/export.ts` and `.github/workflows/snapshot.yml`.

- [ ] `exportWorkbook(h: Historicals, a: Assumptions, sheets: CalcSheet[], beta?: {rows, stats}): Promise<Blob>`:
  - Sheets: `Inputs` (with defined names matching the formula refs), `Historicals`, `Beta` (if returns are present: `SLOPE`, `RSQ`, `STEYX`), one sheet per model, and `Summary`.
  - Every cell writes `{formula, result}`.
- [ ] Workflow:
  - Triggers: `schedule: '0 6 2 * *'` and `workflow_dispatch`. Runner: ubuntu-latest, Node 22.
  - Steps: `npm ci` → `npx tsx scripts/snapshot.ts` with `SEC_USER_AGENT: ${{ secrets.SEC_USER_AGENT }}` → commit `public/data` if changed (bot identity) → push.
  - `on failure`: `gh issue create` with the run URL (`permissions: contents: write, issues: write`).
  - Keep-alive: use the `gautamkrishnar/keepalive-workflow` action, or an empty commit if no data changed in 50 days.
- [ ] Ask the user to add the `SEC_USER_AGENT` secret. Trigger `gh workflow run snapshot.yml` and watch it with `gh run watch`. Expected: success. Record the runtime, disk use and the Nasdaq/Yahoo reachability in the README.
- [ ] Commit.

### Task 8: Two tests (Haiku)

**Files:** create `vitest.config.ts`, `tests/models.test.ts` and `tests/extract.test.ts`, with a trimmed NVDA fixture in `tests/fixtures/nvda.json`.

- [ ] `tests/models.test.ts` (`gordon and fcff match worked example`):
  - Gordon D1=2, re=0.10, g=0.04 → 33.33 (±0.01).
  - FCFF: 5 constant FCFFs of 100, WACC 10%, g 2% → EV = Σ100/1.1^t + (100·1.02/0.08)/1.1^5, to within 0.01.
- [ ] `tests/extract.test.ts` (`nvda revenue extracted from fixture`): FY2025 revenue = 130497000000, and the tag is recorded.
- [ ] Run `npx vitest run`. Expected: 2 passed. Commit.

### Task 9: NVIDIA dry run, reconciliation, deploy prep

- [ ] Open `/value?t=NVDA`. Check revenue, net income, CFO, capex, shares, cash and debt against the 10-K and Yahoo's Financials tab, and record any differences in `docs/dry-run-nvda.md`.
- [ ] Hand-recompute the FCFF value per share in the doc.
- [ ] Export the Excel file, open it in Excel and confirm the Summary values equal the site's to the cent.
- [ ] Optionally reconcile against Damodaran's `fcffsimpleginzu.xlsx` with the same inputs, and record the percentage difference.
- [ ] README: screenshot, live link placeholder, methodology summary, data and licensing notes, disclaimer.
- [ ] Commit and push. Deploying to Vercel and the subdomain needs the user to confirm the domain name.
