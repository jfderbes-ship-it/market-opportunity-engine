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
- A clearly labeled Public Yahoo Chart experimental adapter is permitted for personal learning and no-key testing. It must remain server-side, display timing as variable, and never be described as official or consolidated real-time data.
- The public adapter must be respectful: low concurrency, short-lived caching, visible coverage/errors, and no identity rotation, proxy evasion, or scraping workarounds.

Mock data stays as the default because it makes development deterministic and avoids API limits while the interface and scoring logic are still changing.

External data support is provider-based. The active adapters are Public Yahoo Chart for explicitly experimental no-key testing and Alpaca Delayed SIP for a more dependable opt-in delayed path. Future providers should be added server-side through the same normalized provider contract. Google Finance is useful through its documented Google Sheets function, but it is not a suitable replacement source for this scanner's server-side candle API.

## UX Choices

- Filter edits are staged. Changing controls does not automatically refetch.
- User explicitly clicks `Apply Filters & Search` or `Search Again`.
- Tooltips are intentionally prominent and plain-English because the target user may not understand financial terms.
- Scanner table is the operational center of the app, with Top Opportunities as a compact summary.

## Engineering Choices

- Keep indicator math separate from UI.
- Keep provider normalization separate from scoring.
- Use deterministic mock data for stable tests and UI demos.
- Keep the current lightweight local server boundary until deployment requirements justify a normal server runtime.
