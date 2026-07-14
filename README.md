# Market Opportunity Engine

Prototype scanner for Bollinger Band, RSI, divergence, volume, VWAP, and context based market alerts.

This app is intentionally a research and education tool. It does not execute trades, provide financial advice, or label alerts as buy/sell recommendations.

## Current Build

- React + TypeScript + Vite
- Deterministic mock market data
- Indicator engine for SMA, Bollinger Bands, RSI, VWAP, ATR, relative volume, band width, and squeeze checks
- Bullish and bearish divergence detection over recent swing points
- Opportunity score from 0 to 100
- Ranked scanner table, top opportunity cards, alert feed, market context panel, filters, and ticker detail view
- Truthful empty states: filters never substitute non-matching rows
- Scan coverage, latest-candle, unavailable-symbol, and metadata-status display
- Session-aware VWAP calculation

## Data Plan

The first build uses mock data by default so the strategy and interface can be tested without a market data subscription.

The code is structured around a server-side provider interface so free, delayed, and paid market-data sources can be added without changing the browser application. Free market data sources are usually delayed, rate-limited, symbol-limited, or restricted by terms of use.

Current provider paths:

- Mock Market Stream: default deterministic data for development.
- Alpaca Delayed SIP: the initial real-data path for the built-in starter watchlist. It uses full-market US stock and ETF bars delayed by 15 minutes, which is more appropriate for volume-sensitive research than a partial real-time feed.

The real-data route is currently a local Vite middleware under `server/marketApi.ts`. It keeps provider credentials in the server process. It is deliberately a personal local-development setup, not a deployed service. A later deployment should host that module in a normal server runtime without moving any credentials into the browser.

### Enable Free Delayed Market Data

1. Create an Alpaca account and a paper-trading API key. No brokerage funding or trade permissions are needed for this research tool.
2. Create `.env.local` beside `package.json` using `.env.example` as the shape:

```bash
ALPACA_API_KEY=your_key_id
ALPACA_API_SECRET=your_secret_key
```

3. Restart `npm run dev`, choose **Alpaca Delayed SIP** in Data Feed, and click **Search Again**.

The key and secret must never use a `VITE_` prefix and should never be committed to GitHub. When the provider is unavailable, the app stays in the last successful state and displays the error instead of fabricating results.

### Current Data Limits

- The real-data scan is a small built-in starter watchlist, not a whole-market scanner.
- Live average daily volume is calculated from recent delayed daily bars.
- Earnings dates, float, and bid-ask spread are intentionally not represented as live facts until a verified source is connected.
- Relative volume is currently a local 20-candle comparison. Historical time-of-day relative volume is the next indicator-quality improvement.

## Commands

```bash
npm install
npm run dev
npm run build
npm test
```

## Project Notes

- [Development log](docs/DEV_LOG.md)
- [Restart handoff](docs/HANDOFF.md)
- [Decision notes](docs/DECISIONS.md)
