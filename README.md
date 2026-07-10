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

## Data Plan

The first build uses mock data by default so the strategy and interface can be tested without a market data subscription.

The code is structured around a provider interface so public or free-tier market data can be tested without changing the scanner engine. Free market data sources are usually delayed, rate-limited, symbol-limited, or restricted by terms of use.

Current provider paths:

- Mock Market Stream: default deterministic data for development.
- Yahoo Chart: no-key local prototype feed through the Vite dev proxy. This uses Yahoo Finance chart data but is not an official supported Yahoo API contract.
- Finnhub Candles: set `VITE_FINNHUB_API_KEY` in `.env.local`.
- Alpha Vantage: set `VITE_ALPHA_VANTAGE_API_KEY` in `.env.local`. Intraday delayed/realtime access depends on Alpha Vantage entitlement.

Important: Vite `VITE_*` values are exposed to the browser. That is acceptable for local prototype testing, but production provider calls should move behind a backend proxy. The Yahoo Chart path also depends on the local Vite proxy in development; production should replace this with a backend endpoint and a reviewed data-provider agreement.

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
