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

### 1. What a scenario is (data model)

```ts
type Lever =
  | 'marginTarget' | 'marginYears'          // where margins end up, and how fast
  | 'g1' | 'gDecay' | 'gTypical' | 'gT'     // growth now, how fast excess growth fades, long-run growth
  | 'capexPct' | 'daPct' | 'nwcPct'         // reinvestment
  | 'beta' | 'erp' | 'rd'                   // risk
  | 'exitMultiple' | 'tax';

type Change =
  | { lever: Lever; op: 'set'; value: number }      // margin target = 45%
  | { lever: Lever; op: 'add'; value: number }      // margin target − 15 pts
  | { lever: Lever; op: 'scale'; value: number };   // capex × 1.3

interface Scenario {
  id: string;            // random id
  name: string;          // "Custom silicon squeezes margins"
  story: string;         // one or two lines: the narrative behind the numbers
  changes: Change[];
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

### 2. Storage (local only)

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

### 3. Where it lives in the UI

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

### 4. Templates (ready-made scenarios)

Templates are written as stories with relative changes, so they fit any company. They live in `src/content/scenarioTemplates.ts`
and each has a short "why" line in the same voice as `MODEL_NOTES`. Starting set:

| Template | Story | Changes |
|---|---|---|
| **New competition** | Rivals or customers build their own (custom chips, private labels). Pricing power fades. | target margin −15 pts over 5 yrs; excess growth kept per year 0.70 → 0.55 |
| **Margin reverts to industry** | The moat is weaker than it looks. Margins drift toward the industry median. | target margin = halfway to the Damodaran industry margin (needs the industry margin, which `peers.margin` already holds); margin years 7 |
| **Capex stays high** | The current investment cycle doesn't end: data centres, fabs, grid. | capex × 1.5; D&A × 1.2 |
| **Growth fades faster** | The boom was one-off demand pulled forward. | excess growth kept per year −0.15; growth year 1 × 0.7 |
| **Demand shock / cyclical bust** | A down year, then recovery to a lower plateau. | growth year 1 = −15%; target margin −8 pts |
| **Riskier than the market thinks** | Concentration (a few hyperscaler customers), regulation, export controls. | beta +0.3, or ERP +1 pt |
| **Bull: moat holds** | Software and ecosystem lock-in keep pricing power. | target margin +5 pts; excess growth kept 0.80 |

The NVIDIA story from this conversation = *New competition* + *Capex stays high*. Combining templates = applying both change
lists in one scenario (the editor can "Add changes from template…").

Template numbers are a starting point, not research results. Each one says so in its "why" line. *Builder's call:* tune the
defaults against a few real cases (NVDA, INTC 2000s, CSCO 2001) before shipping.

### 5. Model gaps a good competition scenario needs (engine work)

The current FCFF holds some things flat that a competition story wants to move. These are optional and can be done after v1:

- **Capex path:** today `capexPct` is one number for all ten years. Add `capexPctTarget` + years to reach it (like margins), so
  "capex stays high for 3 years, then normalises" is possible. Needs a change in `fcffSheet` and a new input.
- **Margin path shape:** today margins move linearly to the target. A "decline then plateau" works already. A "squeeze in year
  3" doesn't, and isn't needed for v1.
- **Terminal margin vs target:** if the scenario's margin is meant only for the terminal value, that needs its own input.
  Skip for now.

### 6. Excel export with scenarios

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

### 7. Edge cases

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

1. `src/lib/scenarios/` with `types.ts`, `apply.ts` (`applyScenario`, clamps, diff list) and `store.ts` (localStorage + validation +
   JSON import/export). One or two tests for `applyScenario` (relative changes, clamping).
2. Scenarios tab: list + editor + live DCF preview.
3. Comparison table (all models × base + scenarios).
4. Apply on the page: `activeScenario` state, banner, "Base $X" on model cards, base values on sidebar inputs.
5. Templates file + "start from template" / "add changes from template".
6. Excel: Scenarios sheet, selector, INDEX/MATCH inputs, static summary.
7. Optional engine work: capex path (`capexPctTarget`, years).
8. Later: generate the AI-mode bear/bull cases from saved scenarios; a "scenario fan" chart (value per share for each scenario
   against the price, like the tornado).

## Open questions for later

- Should editing an input while a scenario is active edit the base (current plan) or be locked?
- Should templates be per sector (semis, software, retail) or stay generic, with relative changes?
- Do we want the scenario value per share to feed into the hero/headline number while it is active, or stay inside the cards?
