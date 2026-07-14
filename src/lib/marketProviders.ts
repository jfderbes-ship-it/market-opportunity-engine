import { buildMockSnapshot } from "./mockData";
import type { MarketScanRequest, MarketSnapshot, ProviderId } from "../types";

export interface MarketDataProvider {
  id: ProviderId;
  label: string;
  description: string;
  freshness: string;
  configured: boolean;
  sourceUrl?: string;
  getSnapshot(request: MarketScanRequest): Promise<MarketSnapshot>;
}

export class MockMarketDataProvider implements MarketDataProvider {
  id = "mock" as const;
  label = "Mock Market Stream";
  description = "Deterministic simulated candles for learning the scanner, testing filters, and validating interface behavior.";
  freshness = "Simulated";
  configured = true;

  async getSnapshot(request: MarketScanRequest): Promise<MarketSnapshot> {
    return buildMockSnapshot(request.timeframe, request.priceMin, request.priceMax);
  }
}

export class AlpacaDelayedSipMarketDataProvider implements MarketDataProvider {
  id = "alpaca-delayed-sip" as const;
  label = "Alpaca Delayed SIP";
  description = "Full-market US stock and ETF bars delayed by 15 minutes. API credentials stay in the local server, never in the browser.";
  freshness = "15-minute delayed SIP";
  configured = false;
  sourceUrl = "https://docs.alpaca.markets/us/docs/about-market-data-api";

  async getSnapshot(request: MarketScanRequest): Promise<MarketSnapshot> {
    return fetchServerSnapshot(this.id, request);
  }
}

export class PublicYahooMarketDataProvider implements MarketDataProvider {
  id = "yahoo-public" as const;
  label = "Public Yahoo Chart (Experimental)";
  description = "No-key public chart candles for personal experimentation. Timing and coverage can vary, so always check the newest candle timestamp before using a signal.";
  freshness = "Public feed timing varies";
  configured = true;
  sourceUrl = "https://finance.yahoo.com/";

  async getSnapshot(request: MarketScanRequest): Promise<MarketSnapshot> {
    return fetchServerSnapshot(this.id, request);
  }
}

async function fetchServerSnapshot(provider: ProviderId, request: MarketScanRequest): Promise<MarketSnapshot> {
  const query = new URLSearchParams({
    provider,
    timeframe: request.timeframe,
    symbols: request.symbols.join(","),
    priceMin: String(request.priceMin),
    priceMax: String(request.priceMax)
  });
  const response = await fetch(`/api/market/snapshot?${query}`);
  const payload = (await response.json()) as MarketSnapshot | { error?: string };

  if (!response.ok || !("opportunities" in payload)) {
    throw new Error("error" in payload && payload.error ? payload.error : "The local market-data server could not complete the scan.");
  }
  return payload;
}

export const marketDataProviders: MarketDataProvider[] = [
  new MockMarketDataProvider(),
  new PublicYahooMarketDataProvider(),
  new AlpacaDelayedSipMarketDataProvider()
];

export function getMarketDataProvider(id: ProviderId): MarketDataProvider {
  return marketDataProviders.find((provider) => provider.id === id) ?? marketDataProviders[0];
}

export const publicDataIntegrationNotes = [
  "Mock mode is kept for learning, interface work, and repeatable strategy tests.",
  "Public Yahoo Chart is a no-key experimental fallback. It is clearly labeled because timing, coverage, and availability are not guaranteed.",
  "Alpaca Delayed SIP is the first real-data path because complete delayed market coverage is more dependable for volume-based signals than partial real-time feeds.",
  "The current public scan uses your saved personal watchlist, capped at 50 symbols. It is not a claim to scan every listed security.",
  "Credentials stay in the local server process. Future paid providers use the same server-side provider boundary.",
  "Earnings dates and live bid-ask spreads are intentionally unavailable until a verified source is connected; the UI does not invent them."
];
