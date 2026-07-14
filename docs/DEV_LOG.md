# Development Log

## 2026-07-09 Evening

### Project Direction

- Working name: Market Opportunity Engine.
- Purpose: research-only scanner for Bollinger Band + RSI trading setups.
- Strategy focus: identify potential bounce/pullback watchlist conditions using RSI, Bollinger Bands, divergence, RVOL, VWAP, liquidity, and market context.
- Important constraint: the app must avoid presenting alerts as financial advice, buy/sell recommendations, or guaranteed outcomes.

### Current App State

- React + TypeScript + Vite app.
- Main UI lives in `src/App.tsx`.
- Styling lives in `src/styles.css`.
- Indicator calculations live in `src/lib/indicators.ts`.
- Scoring logic lives in `src/lib/scoring.ts`.
- Market data provider abstraction lives in `src/lib/marketProviders.ts`.
- Mock data lives in `src/lib/mockData.ts`.

### Completed Features

- Deterministic mock market stream for early development and repeatable testing.
- Bollinger Bands, RSI, VWAP, ATR, relative volume, band width, and squeeze checks.
- Bullish and bearish divergence detection over recent swing points.
- Opportunity score from 0 to 100.
- Top Opportunities cards.
- Ranked Scanner table.
- Ticker detail panel with price, RSI, volume, and risk-reference charts.
- Alert Feed and Market Context panels.
- Filter controls with staged changes.
- Prominent `Search Again` / `Apply Filters & Search` buttons.
- Tooltip/explainer balloons on financial terms and scanner controls.
- Server-side provider boundary for external data.

### UI Fixes

- Fixed Ranked Scanner tooltip layering issue where header explainer bubbles appeared behind the Top Opportunities panel.
- Table header tooltips now open downward.
- Scanner panel raises stacking layer while tooltip is hovered/focused.

### July 14, 2026: Trust And Data Foundation

- Removed the active browser-direct Yahoo, Finnhub, and Alpha Vantage paths.
- Added local server-side Alpaca Delayed SIP scan adapter with non-browser credentials.
- Added scan coverage and newest-candle status to the data feed panel.
- Removed fallback rows when filters return no matches.
- Added a session-aware VWAP reset and regression test.
- Real data remains opt-in until local Alpaca paper API credentials are provided.

### July 14, 2026: No-Key Experimental Fallback

- Added Public Yahoo Chart (Experimental) through the same local server-side provider boundary.
- Verified the endpoint returns usable five-minute candles for all 12 starter-watchlist symbols plus market context without an API key.
- Added a three-request concurrency cap, explicit variable-timing label, and Eastern-time newest-candle display.

### July 14, 2026: Clear Simulated Timestamps

- Mock candles remain deterministic for repeatable testing, but the UI now labels their table, alert-feed, timeline, and coverage times as `Simulated`.
- Live and public-provider rows continue to show their actual newest-candle timestamps in Eastern time.

### July 14, 2026: Resume Notes Refreshed

- Replaced outdated repository/bootstrap instructions with a current restart handoff, data-trust rules, architecture map, verification checklist, and sequenced next-work list.
- Confirmed `main` is pushed to `jfderbes-ship-it/market-opportunity-engine` through commit `eaec4f2`.

### July 14, 2026: Personal Watchlist And Respectful Public Data Use

- Added a locally saved 50-symbol trial watchlist with add/remove controls and a clear fixed-demo distinction for Mock mode.
- Public scans now perform price eligibility before daily-volume analysis and report requested, price-eligible, completed, and unavailable counts.
- Added short-lived server-side bar caching to avoid unnecessary repeat public-provider requests; no request-hiding or source-control bypass techniques are used.

### Verification

- `npm test` passed.
- `npm run build` passed.
- `npm audit` returned 0 vulnerabilities.
- Browser check confirmed the Ranked Scanner tooltip opens downward and clears the Top Opportunities panel.
- Browser check confirmed Mock rows and scan coverage present `Simulated`, while the top bar retains the actual local scan-refresh time.

### Git / GitHub

- Local git repo initialized on `main`.
- GitHub remote configured:
  - `git@github.com:jfderbes-ship-it/market-opportunity-engine.git`
- Current `main` branch is pushed to GitHub.
