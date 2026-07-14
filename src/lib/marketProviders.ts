import { buildMockSnapshot } from "./mockData";
import type { MarketSnapshot, ProviderId, Timeframe } from "../types";

export interface MarketDataProvider {
  id: ProviderId;
  label: string;
  description: string;
  freshness: string;
  configured: boolean;
  sourceUrl?: string;
  getSnapshot(timeframe: Timeframe): Promise<MarketSnapshot>;
}

export class MockMarketDataProvider implements MarketDataProvider {
  id = "mock" as const;
  label = "Mock Market Stream";
  description = "Deterministic simulated candles for learning the scanner, testing filters, and validating interface behavior.";
  freshness = "Simulated";
  configured = true;

  async getSnapshot(timeframe: Timeframe): Promise<MarketSnapshot> {
    return buildMockSnapshot(timeframe);
  }
}

export class AlpacaDelayedSipMarketDataProvider implements MarketDataProvider {
  id = "alpaca-delayed-sip" as const;
  label = "Alpaca Delayed SIP";
  description = "Full-market US stock and ETF bars delayed by 15 minutes. API credentials stay in the local server, never in the browser.";
  freshness = "15-minute delayed SIP";
  configured = false;
  sourceUrl = "https://docs.alpaca.markets/us/docs/about-market-data-api";

  async getSnapshot(timeframe: Timeframe): Promise<MarketSnapshot> {
    const query = new URLSearchParams({ timeframe });
    const response = await fetch(`/api/market/snapshot?${query}`);
    const payload = (await response.json()) as MarketSnapshot | { error?: string };

    if (!response.ok || !("opportunities" in payload)) {
      throw new Error("error" in payload && payload.error ? payload.error : "The local market-data server could not complete the scan.");
    }

    return payload;
  }
}

export const marketDataProviders: MarketDataProvider[] = [
  new MockMarketDataProvider(),
  new AlpacaDelayedSipMarketDataProvider()
];

export function getMarketDataProvider(id: ProviderId): MarketDataProvider {
  return marketDataProviders.find((provider) => provider.id === id) ?? marketDataProviders[0];
}

export const publicDataIntegrationNotes = [
  "Mock mode is kept for learning, interface work, and repeatable strategy tests.",
  "Alpaca Delayed SIP is the first real-data path because complete delayed market coverage is more dependable for volume-based signals than partial real-time feeds.",
  "The current live scan is a small built-in watchlist, not a claim to scan every listed security.",
  "Credentials stay in the local server process. Future paid providers use the same server-side provider boundary.",
  "Earnings dates and live bid-ask spreads are intentionally unavailable until a verified source is connected; the UI does not invent them."
];
