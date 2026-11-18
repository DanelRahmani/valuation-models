# Scenario maker: plan

Status: **planned, not started** (2026-11-18). Pick this up on another day.

## Why

The base case is built from the filings: today's margin, today's growth faded the way S&P 500 growth has faded, and today's
capex. The base case can't say anything about a change it has no data for yet. NVIDIA is the example that started this.
Hyperscalers (Google TPU, Amazon Trainium, Microsoft Maia, Meta MTIA) have every reason to build their own chips while GPUs
are this expensive, so margins that look safe today could come under pressure. The question is: "These were the base
assumptions. What if competition arrives?" Not having competitors today doesn't mean not having them tomorrow.

A scenario is a named story ("Custom silicon squeezes margins") turned into a small set of input changes. It is saved in
the user's browser, it is **never applied by default**, and it is always shown against the base case.

## Goals

- Users can create, edit, rename, duplicate and delete named scenarios for a company, all stored locally in the browser.
- Switch one scenario on. The whole page recalculates with it, and every changed input and every model value shows the base value next to it.
- A side-by-side comparison of base vs every saved scenario: value per share for each model, plus the key inputs.
- Ready-made templates (e.g. "New competition") that adapt to the company: they change inputs *relative to* its base case.
- The Excel download includes the scenarios: a live scenario switch in the workbook, so the scenario keeps working in Excel.

## Non-goals

- **No scenarios in share links.** URL encoding stays as it is (`src/lib/share.ts`). Encoding nested scenario sets would make links fragile and messy.
- **No user code.** No TypeScript, JavaScript, `eval`, or free-form formulas. A scenario is declarative data: a list of
  `{ input, operation, value }` changes picked from a fixed set of levers. This is the safety line. Anything a user types
  is a number or a label, never something we run.
- No accounts, sync or server storage. Local only, plus a JSON file export/import for moving scenarios between browsers.
- No probability-weighted scenarios in v1. That already exists in Pre-profit/AI mode (see "Existing bear/base/bull" below).

## Anti-goals (it fails if...)

- A scenario is quietly active and the user mistakes its result for the base case.
- Saved scenarios break or give nonsense values after the monthly data snapshot updates the base numbers.
- It turns into a second, more complicated assumptions panel that nobody understands.

## How other tools do it (research, 2026-11-18)

- **Excel models (banker convention):** one assumptions sheet with a column per case (Base / Bull / Bear) and a "live" column
  that picks the active case with `CHOOSE(MATCH(selector, …))` or `INDEX`. A dropdown cell drives it, and every model sheet
  reads the live column. A **summary table of outputs for all cases** sits next to it, because the selector only shows one case
  at a time. Excel's built-in Scenario Manager is avoided: its summary is static and doesn't update when inputs change.
  Copying the workbook once per case is the classic mistake. → We copy this pattern exactly for the Excel export, and the
  on-screen design mirrors it: a selector plus a comparison table.
- **Damodaran, "Narrative and Numbers":** every valuation starts from a story (market, competition, margins). The story is
  turned into value drivers (revenue path, target operating margin, reinvestment, risk), checked against history and common sense
  ("impossible / implausible / improbable"), and redone as new information comes in. → Every scenario gets a one-line
  **story** field, and templates are written as stories that map to drivers.
- **Simply Wall St "Narratives":** users write a story, set their own growth / margin / multiple assumptions and get their own
  fair value, tracked against the price over time. They can start from someone else's narrative and personalise it. → Supports
  "start from a template, then tweak", and keeping a saved date on each scenario.
- **Mauboussin, competitive advantage period / fade:** competition pushes returns toward the cost of capital. Companies with
  top-quintile returns still fade, but often settle above WACC. How fast they fade depends on reinvestment and how volatile
  returns are. → A competition template should (a) pull the margin down over N years and (b) shorten how long excess growth
  lasts. It should not take margins all the way to the industry average by default.

Sources: [Simply Wall St narratives help](https://support.simplywall.st/hc/en-us/articles/13416018054415-Getting-Started-with-Narratives),
[FE Training: CHOOSE for scenario analysis](https://www.fe.training/free-resources/financial-modeling/choose-function-formula-scenario-analysis/),
[Coefficient: scenario analysis in Excel](https://coefficient.io/cfo-resources/scenario-analysis-in-excel),
[Damodaran: Narrative & Numbers (2023)](https://pages.stern.nyu.edu/~adamodar/pdfiles/country/narrative&numbersshort2023.pdf),
[Damodaran: competitive advantage period notes](https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/cap.pdf),
[Mauboussin: Measuring the Moat](https://www.scribd.com/document/357712424/Measuring-The-Moat-2013-pdf).

## What exists today (and what this builds on)

- `Assumptions` (`src/lib/finance/assumptions.ts`): every editable number. The defaults come from SEC data via `defaultAssumptions`.
- `inputDefs` turns assumptions into named input cells (`margin_target`, `margin_years`, `g_stage1`, `g_decay`, `capex_pct`,
  `beta_l`, `erp`, `g_terminal`, …). These keys are the **levers** a scenario can change.
- `valueWith(wb, overrides)` (`src/lib/finance/uncertainty.ts`) already re-evaluates the workbook with input overrides. The
  tornado and Monte Carlo charts use it. The comparison table can use the same mechanism for every model, not just FCFF, without
  rebuilding sheets.
- `runAll(h, a, src)` runs everything. Applying a scenario on screen = `runAll(h, applyScenario(a, scenario), src)`.
- Excel export (`src/lib/excel/export.ts`): one sheet of Inputs with a **defined name per input**. Every model sheet reads
  inputs by name, so a scenario switch only has to change the Inputs cells.
- **Existing bear/base/bull** (`a.scenarios`, `scenarioSheets` in `models.ts`): only in Pre-profit / AI mode. It is a
  probability-weighted FCFF with fixed growth / margin / capex per case. It stays as it is in v1. Later, the bear/bull cases
  could be generated from saved scenarios (see "Later").
- Nothing per company is stored in `localStorage` yet (only `theme`).

## The design

### 1. The levers (what a scenario can change)

A scenario can only touch these. "Today" means the input already exists and only needs to be exposed. "New" means new
engine inputs (section 5). Every new lever has an **off value** that reproduces today's numbers exactly, so the base case
doesn't move when they are added.

**Growth**

| Lever | What it means | Unit | Status |
|---|---|---|---|
| `g1` Growth, latest year | where the forecast starts | % | today |
| `gDecay` Excess growth kept each year | how fast a boom fades (0.70 = half the gap gone every ~2 yrs) | 0-1 | today |
| `gTypical` Typical company growth | what growth fades toward | % | today |
| `gT` Terminal growth | growth forever after year 10 | % | today (capped at risk-free) |

**Margins**

| Lever | What it means | Unit | Status |
|---|---|---|---|
| `marginTarget` Target operating margin | where margins end up | % | today |
| `marginYears` Years to reach target | straight line from today's margin, then holds | yrs 1-10 | today |

**New-entrant shock** (a one-off hit in a given year, unlike the gradual squeeze above)

| Lever | What it means | Unit | Off value | Status |
|---|---|---|---|---|
| `shockYear` Shock year | the year a rival product takes off (cheap TPUs, Huawei Ascend, …) | yr 1-10 | 0 = no shock | new |
| `shockRevLoss` Revenue lost in the shock | market share and price cuts: a one-time drop in revenue level that year, then growth carries on from the lower base | % of revenue | 0 | new |
| `shockMarginDrop` Margin hit | operating margin points lost from the shock year on | pts | 0 | new |
| `shockRecovery` Margin recovered by year 10 | 0 = the hit is permanent, 1 = fully won back by year 10 | 0-1 | 0 | new |
| `shockGrowthCut` Slower growth after the shock | points off revenue growth every year after the shock (a smaller market for you) | pts | 0 | new |

**Reinvestment**

| Lever | What it means | Unit | Off value | Status |
|---|---|---|---|---|
| `capexPct` Capex, % of revenue | spending during the high phase | % | — | today |
| `capexHighYears` Years capex stays high | today hard-coded to 5 (`HIGH` in `models.ts`) | yrs 0-10 | 5 | new (turns the constant into an input) |
| `capexNormal` Normal capex after that | level it fades to by year 10; default = D&A, as today | % of revenue | = D&A | new |
| `daPct` D&A, % of revenue | | % | — | today |
| `nwcPct` Working capital per new $ of revenue | | % | — | today |

**Risk and the end value**

| Lever | What it means | Unit | Status |
|---|---|---|---|
| `beta` Levered beta | market risk | × | today |
| `erp` Equity risk premium | | % | today |
| `rd` Pre-tax cost of debt | | % | today |
| `exitMultiple` Exit EV/EBITDA | only when the terminal method is "exit" | × | today |
| `tax` Tax rate | e.g. a minimum-tax or export-rule story | % | today |

**Shares**

| Lever | What it means | Unit | Status |
|---|---|---|---|
| `newShares` Extra shares (SBC, conversions) | dilution, already in AI mode | M shares | today, but only used in AI mode: needs wiring into the main per-share rows |

**Rates (macro)**

| Lever | What it means | Unit | Off value | Status |
|---|---|---|---|---|
| `rf` Risk-free rate, permanent | a lasting move in the 10-yr Treasury (to 10%, or down to 2%) | % | — | today |
| `rdFollowsRf` Cost of debt moves with it | on by default: a rate move shifts the cost of debt by the same points | on/off | on | new (scenario layer only) |
| `rfPath` Risk-free rate, year by year | a temporary spike or cut: e.g. 10% in years 1-2, then back to base | % per year | blank = base | new (section 6b) |

The permanent `rf` also caps terminal growth (`gT ≤ rf`). A rate *cut* scenario can therefore lower the cap, and the editor
should say so when it happens. A temporary path does not change the terminal value: only the years it covers are discounted
differently.

**Capacity (energy crunch and other physical limits)**

| Lever | What it means | Unit | Off value | Status |
|---|---|---|---|---|
| `growthCap` Most revenue can grow per year | demand is there, but grid power, fabs or permits are not: growth is capped no matter how much capital there is | % per year | none | new |
| `growthCapYears` For how many years | the crunch eases after this | yrs 1-10 | 0 | new |
| energy costs | not a separate lever: an energy crunch is a margin hit (marginTarget or the shock margin levers) | | | |
| own power (gas turbines) | not a separate lever: capex × (higher spend on own generation), and optionally a higher beta for permit risk | | | |

Left out on purpose: cash and debt (balance-sheet facts), and anything that changes the model choice. Banks and insurers get a
smaller set (growth = book equity growth, plus ROE, plus the rate levers); the capex, capacity and shock-revenue levers are
hidden for them.

**Year by year (advanced).** For growth, operating margin, capex % and the risk-free rate, the user can also open a ten-year
row and type a value for any year, leaving the other years blank (= the model's own path). Each row has a mode: "set to" (this
year's margin *is* 40%) or "change by" (this year's margin is 5 points below the model's). This is the fullest freedom the
tool offers, and it replaces the need for user formulas. It is still just numbers. See section 6b for how the engine does it.

### 2. What a scenario is (data model)

```ts
type Lever =
  | 'g1' | 'gDecay' | 'gTypical' | 'gT'
  | 'marginTarget' | 'marginYears'
  | 'shockYear' | 'shockRevLoss' | 'shockMarginDrop' | 'shockRecovery' | 'shockGrowthCut'
  | 'capexPct' | 'capexHighYears' | 'capexNormal' | 'daPct' | 'nwcPct'
  | 'beta' | 'erp' | 'rd' | 'exitMultiple' | 'tax'
  | 'rf' | 'rdFollowsRf' | 'growthCap' | 'growthCapYears'
  | 'newShares';

/** Year-by-year rows (advanced). values[0] = year 1; null = leave the model's own value for that year. */
type PathLever = 'growth' | 'margin' | 'capexPct' | 'rf';
interface PathChange { lever: PathLever; mode: 'set' | 'add'; values: (number | null)[] /* length 10 */ }

type Change =
  | { lever: Lever; op: 'set'; value: number }      // margin target = 45%
  | { lever: Lever; op: 'add'; value: number }      // margin target − 15 pts
  | { lever: Lever; op: 'scale'; value: number };   // capex × 1.3

interface Scenario {
  id: string;            // random id
  name: string;          // "Custom silicon squeezes margins"
  story: string;         // one or two lines: the narrative behind the numbers
  changes: Change[];
  paths?: PathChange[];  // advanced, year-by-year rows
  templateId?: string;   // if it started from a template
  createdAt: string;     // ISO date
  updatedAt: string;
  baseAtSave: Partial<Record<Lever, number>>; // base values when last saved, to flag drift after a data refresh
}
```

- **Relative changes are the default** (`add` for percentages, `scale` for capex and multiples). A scenario saved in November
  still makes sense after the December snapshot moves the base margin: "−15 pts from wherever base is". A `set` is allowed when
  the user means an absolute number.
- `applyScenario(a, s)` is a pure function: clone `a`, apply the changes in order, clamp each lever to a sane range (margins
  −50%…90%, growth −50%…150%, `marginYears` 1…10, `gT` < `rf`, `beta` 0.3…3, and so on), and return the new assumptions plus a list
  of `{ lever, base, scenario }` for the UI. It never mutates and never runs user text.
- Assumptions the user edited by hand in the sidebar stay the base. A scenario applies on top of whatever the base currently is.

### 3. Storage (local only)

- `localStorage` key `scenarios:v1:<TICKER>` → `Scenario[]`. A separate key `scenarios:v1:active:<TICKER>` is **not** stored:
  a page always opens on the base case (requirement: never applied by default).
- A small module `src/lib/scenarios/store.ts`: `list(ticker)`, `save(ticker, s)`, `remove(ticker, id)`, `exportJson()`, `importJson(file)`.
  Validate on read with a hand-written check (known levers, finite numbers, string lengths capped). Drop anything that doesn't
  pass, so a corrupted or hand-edited entry can't crash the page.
- Every access is wrapped in try/catch (private mode, storage full, blocked). On failure the feature still works for the session,
  with a note "Scenarios can't be saved in this browser".
- Uploaded companies (no ticker) key on the company name + CIK, if present. Otherwise the scenario lasts for the session only.
- JSON export/import (all companies or one), so scenarios can be backed up or moved to another browser. The version field in the
  key allows future migrations.

### 4. Where it lives in the UI

**Simple to start, lots of freedom if wanted.** The editor has three levels, and each one builds on the last:

1. **Pick a template.** One click: "New-entrant shock", "Energy crunch", "Rate shock"… Each comes with its story and
   sensible numbers. Most users stop here.
2. **Simple.** About six plain sliders: target margin, growth fade, capex, rates, plus the shock ("in year __, lose __% of revenue
   and __ pts of margin"). Each shows its base value next to it.
3. **Advanced (opened on request).** Every lever from section 1, plus the **year-by-year grid**: one row each for growth,
   margin, capex % and risk-free rate, ten year columns, "set to / change by" per row. Blank cells keep the model's path, and
   each filled cell shows the model's value underneath for reference.

```
Advanced: year by year          Yr1    Yr2    Yr3    Yr4    Yr5   …  Yr10
Operating margin  [set to ▾]    __     __    40%    38%    __       __
   model's path                62%    61%    60%    59%    58%      55%
Revenue growth    [change by▾]  __     __   -20%    __     __       __
Risk-free rate    [set to ▾]   10%    10%     __     __    __       __
```

**A new tab, "Scenarios"**, next to Models / Value creation / Peers / Uncertainty / Filings (`ValueApp.tsx` tab list). It has:

- **Scenario list**, one row per saved scenario: name, story, number of changes, its DCF value vs base, and buttons for
  *Apply* / *Edit* / *Duplicate* / *Delete*.
- **"New scenario"** opens the editor, either blank or from a template.
- **Editor:** name, story, then a list of changes. Each row = lever dropdown (plain labels like "Operating margin, target"),
  operation (set to / change by / multiply by), value, and a live preview "45.0% (base 60.2%)". The DCF value updates
  as you type, via `valueWith`.
- **Comparison table** (the "side by side"): rows = models (FCFF, FCFE, APV, RI, multiples, …) plus key inputs (target
  margin, growth year 1, capex %, WACC). Columns = Base, then each saved scenario. The difference vs base appears in small type
  under each value. Computed with `evaluate(wb, overrides)` once per scenario. This is cheap: it is the same as one tornado bar.

```
                     Base      New competition   Custom silicon   AI capex boom
FCFF per share     $142.10    $98.40  (−31%)    $86.20 (−39%)    $171.00 (+20%)
FCFE per share     $139.80    $95.10  (−32%)    …
Target margin       62.0%     47.0%             42.0%            62.0%
Growth, year 1      114%      114%              90%              130%
Capex % revenue     1.9%      1.9%              1.9%             3.5%
```

**Applying a scenario** (the "switch it on"):

- Applying from the tab sets an `activeScenario` in React state only (not stored). The whole page recalculates with it.
- A **sticky banner** across the top of the results: "Scenario: New competition · Base case $142.10 → $98.40 · [Back to base]".
  It is impossible to miss. This is the guard against the main anti-goal.
- Each model card shows "Base $142.10" in small type under the scenario value.
- In the sidebar, each input the scenario changed shows its scenario value, highlighted, with "base 62.0%" underneath. Editing
  an input while a scenario is active edits the **base** (the scenario stays relative), with a one-line note saying so. *Builder's
  call:* the alternative is to lock those fields while a scenario is active. Pick whichever tests better.
- The share-link button still shares the base case. While a scenario is active its tooltip says "Share links don't include scenarios".

### 5. Templates (ready-made scenarios)

Templates are written as stories with relative changes, so they fit any company. They live in `src/content/scenarioTemplates.ts`
and each has a short "why" line in the same voice as `MODEL_NOTES`. Starting set:

| Template | Story | Changes |
|---|---|---|
| **New competition** | Rivals or customers build their own (custom chips, private labels). Pricing power fades. | target margin −15 pts over 5 yrs; excess growth kept per year 0.70 → 0.55 |
| **Margin reverts to industry** | The moat is weaker than it looks. Margins drift toward the industry median. | target margin = halfway to the Damodaran industry margin (needs the industry margin, which `peers.margin` already holds); margin years 7 |
| **Capex stays high** | The current investment cycle doesn't end: data centres, fabs, grid. | capex × 1.5; capex high for 10 yrs (no fade); D&A × 1.2 |
| **Capex stays high, then normalises** | The build-out runs a few more years, then spending falls back to maintenance. | capex × 1.5; capex high for 3 yrs; normal capex = D&A |
| **New-entrant shock** | A rival chip (Google TPU, Huawei Ascend, a cheap custom ASIC) suddenly takes off and takes share, and prices fall. | shock in year 3; revenue −20% that year; margin −20 pts; 25% of the margin hit won back by year 10; growth −3 pts after the shock |
| **Growth fades faster** | The boom was one-off demand pulled forward. | excess growth kept per year −0.15; growth year 1 × 0.7 |
| **Demand shock / cyclical bust** | A down year, then recovery to a lower plateau. | growth year 1 = −15%; target margin −8 pts |
| **Riskier than the market thinks** | Concentration (a few hyperscaler customers), regulation, export controls. | beta +0.3, or ERP +1 pt |
| **Bull: moat holds** | Software and ecosystem lock-in keep pricing power. | target margin +5 pts; excess growth kept 0.80 |
| **Rate shock** | Inflation comes back and the 10-yr Treasury jumps to 10% for two years, then settles at 6%. | rf path: 10%, 10%, then 6%; permanent rf = 6%; cost of debt follows |
| **Rates stay high** | No return to cheap money. | permanent rf +2 pts; ERP +0.5 pt |
| **Rate cut** | Borrowing gets much cheaper (recession response). | permanent rf −2 pts (warns that terminal growth's cap drops with it) |
| **Energy crunch** | The grid is full. New data centres, fabs and factories wait years for power; gas turbines fill some of the gap but cost more and face limits in some countries. | growth capped at 15%/yr for 4 yrs; margin −3 pts (power costs); capex × 1.2 (own generation); beta +0.1 |

Energy crunch hits different companies differently, and the template's "why" line says so: a chip designer loses because its
customers can't plug in new racks; a utility or a turbine maker may gain. The template is written for power *users*. For
power *sellers* the user flips the signs, or we ship a second "Energy crunch (power seller)" template later.

*New competition* is the slow squeeze (margins drift down over years). *New-entrant shock* is the sudden one (a step down in a
given year). They tell different stories and give different values, because a late shock leaves more good years before it.
The NVIDIA story from this conversation is either *New competition* + *Capex stays high, then normalises* (gradual) or
*New-entrant shock* + the same capex template (sudden). Combining templates = applying both change
lists in one scenario (the editor can "Add changes from template…").

Template numbers are a starting point, not research results. Each one says so in its "why" line. *Builder's call:* tune the
defaults against a few real cases (NVDA, INTC 2000s, CSCO 2001) before shipping.

### 6. Engine work the new levers need

**Constraint found while planning:** the formula engine (`src/lib/finance/calcsheet.ts`) supports `+ - * /`, `SUM`, `MIN`,
`MAX`, `AVERAGE` and `ABS`. It has **no `IF` and no comparisons**, so "if year = 3 then …" formulas can't be written. Two ways
around it:

- **A. Compile scenarios into per-year adjustment rows (chosen).** `applyScenario` (TypeScript) turns every lever (shock, cap,
  capex years, year-by-year rows, rate path) into plain numbers for each year 1-10. The sheet only multiplies and adds them, so
  no `IF` is needed and the Excel export stays simple. Each adjustment has a neutral value (× 1, + 0, weight 0, cap 1000%).
- **B. Add `IF` and comparisons to the engine** (parser, evaluator, `toExcel`, `toReadable`). This is more general, but it
  touches the core every model depends on. Keep it as a fallback.

**Per-year adjustment inputs** (t = 1…10, in a new input group "Scenario adjustments"):

| Input | Neutral | Used in | Filled by |
|---|---|---|---|
| `adj_g_t` growth change | 0 | growth: `model + adj_g_t` | shock growth cut, "change by" growth row |
| `ovw_g_t` / `ov_g_t` growth set weight / value | 0 / 0 | growth: `(1-ovw)*(…) + ovw*ov` | "set to" growth row |
| `cap_g_t` growth cap | 10 | growth: `MIN(…, cap_g_t)` | energy crunch / capacity cap |
| `rev_step_t` revenue step | 1 | revenue: `rev[t-1]*(1+g[t])*rev_step_t` | `1 − loss` in the shock year |
| `adj_m_t` margin change | 0 | margin: `MAX(-0.5, path + adj_m_t)` | shock margin hit, "change by" margin row |
| `ovw_m_t` / `ov_m_t` margin set | 0 / 0 | as for growth | "set to" margin row |
| `capex_t` capex % path | the model's own path | capex: `rev*capex_t` | capex years / normal level, year-by-year capex row |
| `adj_rf_t` rate change | 0 | discounting (below) | rate path: `path_t − rf` |

How the levers compile:

- **New-entrant shock in year S:** `rev_step_S = 1 − loss`; `adj_m_t = −drop × (1 − recovery × (t−S)/(10−S))` for t ≥ S;
  `adj_g_t = −growthCut` for t > S. The year-10 margin carries into the terminal value, so a permanent hit stays in the value.
- **Capex high for H years, then normal:** `capex_t = capexPct` for t ≤ H, then a straight line to `capexNormal` by year 10.
  Defaults H = 5 and normal = MIN(D&A, capex) reproduce today's capex row exactly (correction to the first draft: the engine
  already does "high for 5 years, then fade to D&A", with `HIGH = 5` hard-coded in `models.ts`).
- **Growth cap:** `cap_g_t = growthCap` for t ≤ capYears.
- **Temporary rate path:** cumulative discounting, `df_t = df_{t-1} / (1 + wacc + adj_rf_t × k)`, where `k = (1−w_debt) +
  w_debt×(1−tax)` when cost of debt follows (else `1−w_debt`). Neutral gives 1/(1+wacc)^t as today. The terminal value keeps the
  long-run `wacc`. A permanent rate move just changes `rf`.
- **Year-by-year rows** apply last, so the grid always wins.

Rules:

- **Only emitted when used.** With no scenario active, none of these inputs or rows exist, so the base case's "Show calculations"
  and Excel file are unchanged. When a scenario is active, its rows show with plain labels ("Scenario: revenue step").
- **Regression test:** with everything neutral, every model value is identical to today's to the cent.
- FCFE and APV reuse the FCFF revenue / margin / capex rows. Check they pick the adjustments up. Residual income and the DDMs
  aren't driven by them, and the comparison table says so.
- Margin is floored at −50%. A revenue drop releases working capital that year. That is realistic, and the row note says so.

### 7. Excel export with scenarios

Follow the banker pattern from the research:

- New **Scenarios** sheet: column A = input name, column B = Base value, then one column per saved scenario (its value after
  `applyScenario`), plus a **selector cell** (data-validation dropdown: Base, scenario names) with defined name `scenario_sel`.
- On the **Inputs** sheet, each input that *any* scenario changes becomes a formula:
  `=INDEX(Scenarios!B5:F5, MATCH(scenario_sel, Scenarios!B$2:F$2, 0))`. Unchanged inputs stay blue hard-coded values. Model
  sheets don't change: they already read inputs by defined name.
- Below it, a **summary table** of value per share for every model × scenario, written as static values with a note
  ("recomputed by the site; switch `scenario_sel` to see each case live"). Excel can't recompute all columns at once without data
  tables, and static is honest.
- The download always opens on **Base** (selector = Base), whatever is active on screen. The About sheet lists the scenarios
  and their stories.
- If no scenarios are saved, the export is unchanged.

### 8. Edge cases

- **Financial firms** (banks, insurers): growth levers map to book equity growth, the headline model is residual income, and
  capex levers don't apply. The lever dropdown filters by `a.financial`, and templates that need capex are hidden for banks.
- **Base drift:** when a snapshot update moves a base value more than a set amount from `baseAtSave`, show "base has changed
  since you saved this (margin 58% → 62%)". Relative changes still apply. This is only a notice.
- **Invalid results:** a scenario that makes WACC ≤ terminal growth, or makes equity negative, reuses the existing `judge()`
  warnings and statuses. No special handling.
- **Pre-profit / AI mode on:** saved scenarios still apply to the base assumptions. The probability-weighted block keeps its own
  inputs.
- **Storage limits:** a scenario is under 1 KB, so hundreds fit easily. Cap at 50 per company anyway.

## Approaches considered

1. **Overrides on top of base, relative by default (chosen).** Small data, survives data refreshes, reuses `valueWith` and
   the defined-name Excel structure. Downside: some stories need engine changes (capex path).
2. **Full copy of the assumptions per scenario.** Simplest to apply, but goes stale the moment the snapshot refreshes, and the
   comparison can't say *what* the scenario changed. Rejected.
3. **User-written formulas or code** ("margin = base − 0.02 × year"). The most flexible, but a security risk (running user
   input) and too complex for the audience. Rejected. The user also ruled it out.

## Build order (when we pick this up)

0. Engine first (section 6): the per-year adjustment inputs and rows (growth, cap, revenue step, margin, capex path, rate path),
   emitted only when used and wired into FCFF / FCFE / APV, plus `applyScenario`'s compile step from levers to per-year numbers.
   Tests: everything neutral = today's values exactly; a shock in year 3 lowers year-3 revenue by the set share.
1. `src/lib/scenarios/` with `types.ts`, `apply.ts` (`applyScenario`, clamps, diff list) and `store.ts` (localStorage + validation +
   JSON import/export). One or two tests for `applyScenario` (relative changes, clamping).
2. Scenarios tab: list + editor + live DCF preview.
3. Comparison table (all models × base + scenarios).
4. Apply on the page: `activeScenario` state, banner, "Base $X" on model cards, base values on sidebar inputs.
5. Templates file + "start from template" / "add changes from template".
6. Excel: Scenarios sheet, selector, INDEX/MATCH inputs, static summary.
7. Later: generate the AI-mode bear/bull cases from saved scenarios; a "scenario fan" chart (value per share for each scenario
   against the price, like the tornado).

## Open questions for later

- Should editing an input while a scenario is active edit the base (current plan) or be locked?
- Should templates be per sector (semis, software, retail) or stay generic, with relative changes?
- Do we want the scenario value per share to feed into the hero/headline number while it is active, or stay inside the cards?
- Should the new levers (capex years, shock) also appear in the normal sidebar for everyone, or only inside scenarios? Plan:
  only inside scenarios, to keep the sidebar simple.
- Shock revenue loss: is it a one-time step (current plan) or spread over two years? A two-year version needs one more input.
- Tune the template numbers (−20% revenue, −20 pts margin, year 3) against real cases before shipping.
