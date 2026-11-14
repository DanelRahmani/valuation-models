# Valuation Models

**Live:** https://valuation.danelrahmani.com

Type an S&P 500 ticker and get eight valuation methods side by side, built from the company's SEC filings:

- FCFF DCF, FCFE DCF and APV
- Residual income
- Dividend discount models: Gordon, two-stage and H-model, plus a total payout model that counts buybacks
- Multiples
- Reverse DCF
- A scenario-weighted mode for pre-profit and AI companies

Every number on the site can be clicked to show its formula, in words and in Excel syntax. The whole model downloads as an Excel workbook with live formulas.

> Mathematical valuations under stated assumptions. Not investment advice.
>
> The defaults that move answers most (growth capped at 20%, when the dividend models run, missing capex, negative values) and the known limitations are written up under [Limits and judgment calls](https://valuation.danelrahmani.com/methodology/#limits).

## What makes it different

- **One formula engine for the site and Excel.** Each model is written once as spreadsheet formulas (`src/lib/finance/models.ts`). The site evaluates them with a small built-in engine (`calcsheet.ts`), and the export writes the same formulas into the workbook. Recalculated in Microsoft Excel, the NVIDIA workbook matches the site to 4 decimals.
- **The cost of capital is estimated, not typed in:**
  - **Beta:** regression on 60 monthly returns vs SPY, with R², standard error and Blume adjustment. Damodaran's industry beta, relevered with Hamada, is offered as a cross-check.
  - **ERP:** Damodaran's implied ERP.
  - **Risk-free rate:** the 10-year Treasury yield from FRED.
- **The models agree with each other.** FCFF, FCFE, APV and residual income are built to be consistent: constant leverage, clean surplus. They agree within about 1% on NVIDIA. See [`docs/dry-run-nvda.md`](docs/dry-run-nvda.md).
- **Every number has a source.** Each input shows where it came from: a filing tag, the snapshot, a default, or you.

## Architecture

| Part | Where |
|---|---|
| Static site | Next.js `output: 'export'`, no server functions, no cookies, no analytics |
| Finance engine | `src/lib/finance/` (pure TypeScript, shared by the site and the snapshot script) |
| Excel export | `src/lib/excel/export.ts` (ExcelJS, in the browser) |
| Monthly data | `scripts/snapshot.ts` run by `.github/workflows/snapshot.yml` on the 2nd of each month |
| Data files | `public/data/` (about 43 KB per company, about 20 MB for the S&P 500) |

The snapshot script:
1. Downloads SEC's nightly `companyfacts.zip`, falling back to per-company requests at ≤5/s if needed.
2. Trims each company to about 20 XBRL concepts.
3. Estimates betas from Nasdaq prices, falling back to Yahoo.
4. Publishes only the beta statistics and the latest close, never raw price histories.

If more than 5% of companies fail, nothing is committed and a GitHub issue is opened.

### Setup

Add a repository secret `SEC_USER_AGENT` (for example `Valuation Models you@example.com`). SEC requires a contact on every request.

```bash
npm install
npm run dev                                                   # http://localhost:3000
SEC_USER_AGENT="Name you@example.com" npm run snapshot -- --only NVDA,AAPL
npm test                                                      # two tests
```

## Data sources

| Data | Source |
|---|---|
| Financials | SEC EDGAR XBRL company facts (public domain) |
| Risk-free rate | FRED DGS10 |
| Equity risk premium, industry betas and multiples | Aswath Damodaran's data library |
| Price histories for beta estimation | Nasdaq / Yahoo Finance (not redistributed) |
