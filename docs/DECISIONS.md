# Decision Notes

## Product Framing

The app is framed as a market opportunity scanner, not an auto-trading bot or investment advisor. Alerts are watchlist events and should stay language-neutral: no buy/sell instructions, no guaranteed outcomes, and no implied profit probabilities.

## Strategy Scope

The first strategy remains focused on Bollinger Band + RSI setups:

- Oversold RSI near lower band for possible bounce setups.
- Overbought RSI near upper band for possible pullback setups.
- Divergence, RVOL, VWAP, liquidity, and market context act as confidence modifiers.

## Data Approach

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

