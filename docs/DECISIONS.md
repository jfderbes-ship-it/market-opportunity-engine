# Decision Notes

## Product Framing

The app is framed as a market opportunity scanner, not an auto-trading bot or investment advisor. Alerts are watchlist events and should stay language-neutral: no buy/sell instructions, no guaranteed outcomes, and no implied profit probabilities.

## Strategy Scope

The first strategy remains focused on Bollinger Band + RSI setups:

- Oversold RSI near lower band for possible bounce setups.
- Overbought RSI near upper band for possible pullback setups.
- Divergence, RVOL, VWAP, liquidity, and market context act as confidence modifiers.

## Data Approach

### July 14, 2026: Free Data Priority

- The first real-data route uses Alpaca delayed SIP through a local server boundary.
- We prefer clearly labeled 15-minute delayed full-market data over partial real-time data for an indicator set that depends on volume and VWAP.
- Yahoo Finance scraping and browser-direct provider keys are removed from the active product path.
- The initial real-data scope is a built-in personal watchlist. It is not presented as a complete-market scan.
- Provider credentials stay server-side. Future paid providers should implement the same provider contract rather than adding browser-side API calls.

Mock data stays as the default because it makes development deterministic and avoids API limits while the interface and scoring logic are still changing.

External data support is provider-based:

- Yahoo Chart: useful for near-real-time prototype testing, but unofficial.
- Finnhub: API-key path for candle data.
- Alpha Vantage: API-key path with free-tier limitations.

Production should use a backend proxy for provider calls and key protection.

## UX Choices

- Filter edits are staged. Changing controls does not automatically refetch.
- User explicitly clicks `Apply Filters & Search` or `Search Again`.
- Tooltips are intentionally prominent and plain-English because the target user may not understand financial terms.
- Scanner table is the operational center of the app, with Top Opportunities as a compact summary.

## Engineering Choices

- Keep indicator math separate from UI.
- Keep provider normalization separate from scoring.
- Use deterministic mock data for stable tests and UI demos.
- Avoid adding backend/server complexity until provider needs justify it.
