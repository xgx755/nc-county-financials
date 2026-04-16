# NC County Financial Explorer

An interactive data visualization of North Carolina county finances, built from the Annual Financial Information Reports (AFIR) published by the NC Department of State Treasurer.

**Live site:** https://xgx755.github.io/nc-county-financials

## What it shows

- Revenue composition by source (property taxes, sales tax, intergovernmental, etc.)
- Expenditure allocation by function (education, public safety, human services, etc.)
- Per capita comparisons against population-group averages
- Side-by-side comparison between any two counties
- Sortable table of all 100 counties, using FY2025 AFIR data where available and earlier AFIR fallback years for non-filers

## Data

Primary snapshot is fiscal year ending **June 30, 2025**. Counties missing FY2025 AFIR data fall back to FY2024, then the latest older AFIR year available locally. Source: [NC Department of State Treasurer — AFIR](https://www.nctreasurer.com/local-government/financial-data/annual-financial-information-report).

The runtime snapshot in `src/data/counties.json` is assembled from the yearly AFIR extracts using `scripts/merge_county_snapshots.py`.

## Development

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

```bash
npm run deploy
```

This builds the project and pushes the `dist/` folder to the `gh-pages` branch.

## Tech

React 19 · Vite 8 · Recharts 3
