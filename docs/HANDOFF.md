# Restart Handoff

Read this file first when resuming work.

## Current Snapshot

- Local project: `C:\dev_bollinger_band_invest_tool`
- GitHub repository: `git@github.com:jfderbes-ship-it/market-opportunity-engine.git`
- Branch: `main`
- Last verified commit: run `git log -1 --oneline` from the project directory.
- Current development session is available at `http://127.0.0.1:5174/`. Vite normally starts at `5173`; it uses the next free port when that port is occupied.
- Product status: local personal research prototype. It is not a deployed service, brokerage, trade executor, or investment advisor.

## What Works Now

- Bollinger Band + RSI scanner with divergence, VWAP, ATR, relative volume, liquidity warnings, market context, risk-reference zones, and attention scoring.
- Staged filters with explicit `Apply Filters & Search` and `Search Again` actions.
- Clear hover/focus explanations for controls and financial terms.
- Deterministic Mock Market Stream for repeatable learning, UI work, and tests.
- Public Yahoo Chart (Experimental) no-key, server-side data path for personal near-real-time experimentation.
- A saved, browser-local 50-symbol trial watchlist with explicit add/remove controls. Public providers check price eligibility before daily-volume analysis.
- Alpaca Delayed SIP server-side provider, configured locally with credentials kept in ignored `.env.local`; the browser never receives them.
- Data coverage, unavailable-symbol, metadata, freshness, and newest-candle status in the interface.
- Mock rows and events explicitly show `Simulated`; they never present fabricated timestamps as live market updates.

## Data Trust Rules

1. Mock data is for learning and repeatable development only.
2. Public Yahoo Chart is unofficial and variable. Check the displayed newest-candle time every scan; disregard stale or inconsistent scans.
3. Respect public-source limits: use the built-in low concurrency and short-lived cache, do not attempt to hide requests or bypass a source's restrictions.
4. Alpaca Delayed SIP is the preferred verified data route. It remains 15 minutes delayed and uses locally stored credentials.
5. The current scan covers a saved personal watchlist, not the entire US market.
6. Earnings dates, live float, and bid-ask spread are unavailable until a verified provider is connected. Do not invent substitute values or imply otherwise.
7. Keep credentials out of Git and never use `VITE_` prefixes for them; Vite exposes those values to the browser.

## Architecture Map

- `src/App.tsx`: application state, scanner filtering, and UI composition.
- `src/lib/indicators.ts`: indicator calculations. Its session-aware VWAP behavior has regression coverage.
- `src/lib/scoring.ts`: converts normalized indicator evidence into an attention score.
- `src/lib/mockData.ts`: deterministic fixture data and starter universe metadata.
- `src/lib/marketProviders.ts`: browser-side provider selection and local API client.
- `server/marketApi.ts`: server-only provider adapters, normalization, concurrency control, and credential boundary.
- `src/types.ts`: normalized provider, scanner, and opportunity contracts.

## Quick Start

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Use the Mock feed first; choose Public Yahoo Chart and click `Search Again` only when testing external data.

## Verification Before Commit

```bash
npm test
npm run build
npm audit --audit-level=high
git diff --check
git status --short --branch
```

For UI changes, check the browser at the active local URL. Verify the target state in both Mock mode and, when available, Public Yahoo Chart mode. Do not claim a data feed is real-time, comprehensive, or reliable without direct evidence from the provider and the newest-candle display.

## Recommended Next Work

1. Add a persisted personal watchlist editor with symbol validation and a clear scan-universe count.
2. Add provider-normalization fixtures and tests for bad responses, stale timestamps, partial coverage, and empty scans.
3. Improve relative volume from a local 20-candle comparison to a historical time-of-day baseline, while keeping its method visible in the UI.
4. Build a dated daily candidate inbox from Alpaca most-active and mover screeners, with explicit `Pin` and `Dismiss` actions before altering the saved watchlist.
5. Expand the visible saved-watchlist limit from 50 to 70, then 100, only after the daily candidate workflow and batch error behavior are stable.
6. Consider non-execution alert persistence only after the data quality and scanner-universe behavior are stable.

## Boundaries For Future Changes

- Keep the UI simple enough to prioritize readable market evidence over extra dashboards.
- Preserve explicit user-controlled searches; do not silently rescan when filters change.
- Keep provider calls behind `server/marketApi.ts`; future paid providers should implement the same boundary.
- Expand automated tests whenever shared calculations, provider normalization, or scoring rules change.
- Do not add trade execution, brokerage integration, or advisory language to this prototype.
