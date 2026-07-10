import { buildMockSnapshot } from "./mockData";
import { buildMarketContext, getScannerUniverse } from "./mockData";
import { calculateRSI } from "./indicators";
import { evaluateTicker } from "./scoring";
import type { Candle, FeedStatus, MarketSnapshot, ProviderId, TickerMeta, Timeframe } from "../types";

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
  description = "Deterministic simulated candles for early strategy, UI, and scoring tests.";
  freshness = "Simulated";
  configured = true;

  async getSnapshot(timeframe: Timeframe): Promise<MarketSnapshot> {
    return buildMockSnapshot(timeframe);
  }
}

export class FinnhubMarketDataProvider implements MarketDataProvider {
  id = "finnhub" as const;
  label = "Finnhub Candles";
  description = "API-key intraday candle feed for testing closer-to-live market scans.";
  freshness = "Provider-dependent";
  configured = Boolean(import.meta.env.VITE_FINNHUB_API_KEY);
  sourceUrl = "https://finnhub.io/docs/api/stock-candles";

  async getSnapshot(timeframe: Timeframe): Promise<MarketSnapshot> {
    const token = import.meta.env.VITE_FINNHUB_API_KEY;
    if (!token) {
      throw new Error("Finnhub provider selected, but VITE_FINNHUB_API_KEY is not configured.");
    }

    const context = buildMarketContext();
    const universe = getScannerUniverse().filter((meta) => meta.symbol !== "VIX");
    const settled = await Promise.allSettled(
      universe.map(async (meta) => evaluateTicker(meta, await fetchFinnhubCandles(meta.symbol, timeframe, token), context, timeframe))
    );
    const opportunities = settled
      .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
      .filter((opportunity) => opportunity.chartData.length >= 35)
      .sort((a, b) => b.score - a.score)
      .map((opportunity, index) => ({ ...opportunity, rank: index + 1 }));

    if (opportunities.length === 0) {
      throw new Error("Finnhub returned no usable candle data for the current universe.");
    }

    return withFeedStatus(
      {
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        opportunities,
        context,
        feedStatus: makeFeedStatus(this)
      },
      this
    );
  }
}

export class YahooChartMarketDataProvider implements MarketDataProvider {
  id = "yahoo" as const;
  label = "Yahoo Chart";
  description = "No-key Yahoo Finance chart feed via local dev proxy. Useful for prototype testing, but unofficial and commonly delayed.";
  freshness = "Near real-time/delayed";
  configured = true;
  sourceUrl = "https://finance.yahoo.com/";

  async getSnapshot(timeframe: Timeframe): Promise<MarketSnapshot> {
    const universe = getScannerUniverse().filter((meta) => meta.symbol !== "VIX");
    const context = await buildYahooMarketContext(timeframe);
    const settled = await Promise.allSettled(
      universe.map(async (meta) => evaluateTicker(meta, await fetchYahooCandles(meta.symbol, timeframe), context, timeframe))
    );
    const opportunities = settled
      .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
      .filter((opportunity) => opportunity.chartData.length >= 35)
      .sort((a, b) => b.score - a.score)
      .map((opportunity, index) => ({ ...opportunity, rank: index + 1 }));

    if (opportunities.length === 0) {
      throw new Error("Yahoo Chart returned no usable candle data for the current universe.");
    }

    return withFeedStatus(
      {
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        opportunities,
        context,
        feedStatus: makeFeedStatus(this)
      },
      this
    );
  }
}

export class AlphaVantageMarketDataProvider implements MarketDataProvider {
  id = "alpha-vantage" as const;
  label = "Alpha Vantage";
  description = "API-key OHLCV feed. Intraday delayed/realtime access depends on Alpha Vantage entitlement.";
  freshness = "Delayed/realtime entitlement";
  configured = Boolean(import.meta.env.VITE_ALPHA_VANTAGE_API_KEY);
  sourceUrl = "https://www.alphavantage.co/documentation/";

  async getSnapshot(timeframe: Timeframe): Promise<MarketSnapshot> {
    const apiKey = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      throw new Error("Alpha Vantage provider selected, but VITE_ALPHA_VANTAGE_API_KEY is not configured.");
    }

    const context = buildMarketContext();
    const universe = getScannerUniverse().filter((meta) => meta.symbol !== "VIX").slice(0, 8);
    const settled = await Promise.allSettled(
      universe.map(async (meta) => evaluateTicker(meta, await fetchAlphaVantageCandles(meta.symbol, timeframe, apiKey), context, timeframe))
    );
    const opportunities = settled
      .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
      .filter((opportunity) => opportunity.chartData.length >= 35)
      .sort((a, b) => b.score - a.score)
      .map((opportunity, index) => ({ ...opportunity, rank: index + 1 }));

    if (opportunities.length === 0) {
      throw new Error("Alpha Vantage returned no usable candle data for the current universe.");
    }

    return withFeedStatus(
      {
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        opportunities,
        context,
        feedStatus: makeFeedStatus(this)
      },
      this
    );
  }
}

export const marketDataProviders: MarketDataProvider[] = [
  new MockMarketDataProvider(),
  new YahooChartMarketDataProvider(),
  new FinnhubMarketDataProvider(),
  new AlphaVantageMarketDataProvider()
];

export function getMarketDataProvider(id: ProviderId): MarketDataProvider {
  return marketDataProviders.find((provider) => provider.id === id) ?? marketDataProviders[0];
}

export const publicDataIntegrationNotes = [
  "Keep mock mode as the default so development does not depend on API keys or market hours.",
  "Yahoo Chart provides a no-key local prototype feed through the Vite dev proxy, but it is unofficial and may be delayed or unavailable.",
  "Finnhub and Alpha Vantage adapters are wired behind the same MarketDataProvider interface for documented API-key feeds.",
  "Free data is commonly delayed, rate-limited, or symbol-limited, so feed status and provider errors are displayed clearly.",
  "Browser-exposed Vite API keys are acceptable for local prototype testing only; production should move provider calls behind a backend proxy."
];

async function buildYahooMarketContext(timeframe: Timeframe) {
  const contextSymbols = [
    { symbol: "SPY", noteLabel: "Large-cap" },
    { symbol: "QQQ", noteLabel: "Growth" },
    { symbol: "IWM", noteLabel: "Small-cap" },
    { symbol: "^VIX", displaySymbol: "VIX", noteLabel: "Volatility" }
  ];
  const settled = await Promise.allSettled(
    contextSymbols.map(async (item) => {
      const candles = await fetchYahooCandles(item.symbol, timeframe);
      const first = candles[0];
      const latest = candles[candles.length - 1];
      const changePercent = ((latest.close - first.close) / first.close) * 100;
      const rsiValues = calculateRSI(candles.map((candle) => candle.close));
      const rsi = rsiValues[rsiValues.length - 1] ?? 50;
      const trend = classifyContextTrend(item.symbol, changePercent, rsi);

      return {
        symbol: item.displaySymbol ?? item.symbol,
        trend,
        changePercent,
        rsi,
        note: `${item.noteLabel} context from Yahoo chart candles.`
      };
    })
  );
  const context = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

  return context.length >= 3 ? context : buildMarketContext();
}

async function fetchYahooCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const url = new URL(`${yahooBaseUrl()}/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", yahooRange(timeframe));
  url.searchParams.set("interval", yahooInterval(timeframe));
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "history");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Yahoo Chart request failed for ${symbol}: ${response.status}`);
  }

  const data = (await response.json()) as YahooChartResponse;
  const result = data.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];

  if (!result?.timestamp || !quote?.open || !quote.high || !quote.low || !quote.close || !quote.volume) {
    throw new Error(`Yahoo Chart returned no candles for ${symbol}.`);
  }

  const candles: Candle[] = [];

  result.timestamp.forEach((timestamp, index) => {
    const open = quote.open![index];
    const high = quote.high![index];
    const low = quote.low![index];
    const close = quote.close![index];
    const volume = quote.volume![index] ?? 0;

    if (
      !isFiniteNumber(open) ||
      !isFiniteNumber(high) ||
      !isFiniteNumber(low) ||
      !isFiniteNumber(close) ||
      !isFiniteNumber(volume)
    ) {
      return;
    }

    candles.push({
      time: formatMarketTime(new Date(timestamp * 1000)),
      open,
      high,
      low,
      close,
      volume
    });
  });

  return candles.slice(-180);
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

async function fetchFinnhubCandles(symbol: string, timeframe: Timeframe, token: string): Promise<Candle[]> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - lookbackSeconds(timeframe);
  const url = new URL("https://finnhub.io/api/v1/stock/candle");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("resolution", finnhubResolution(timeframe));
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));
  url.searchParams.set("token", token);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub request failed for ${symbol}: ${response.status}`);
  }

  const data = (await response.json()) as {
    s: string;
    t?: number[];
    o?: number[];
    h?: number[];
    l?: number[];
    c?: number[];
    v?: number[];
  };

  if (data.s !== "ok" || !data.t || !data.o || !data.h || !data.l || !data.c || !data.v) {
    throw new Error(`Finnhub returned no candles for ${symbol}.`);
  }

  return data.t.map((timestamp, index) => ({
    time: formatMarketTime(new Date(timestamp * 1000)),
    open: data.o![index],
    high: data.h![index],
    low: data.l![index],
    close: data.c![index],
    volume: data.v![index]
  }));
}

async function fetchAlphaVantageCandles(symbol: string, timeframe: Timeframe, apiKey: string): Promise<Candle[]> {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("outputsize", "compact");

  if (timeframe === "1d") {
    url.searchParams.set("function", "TIME_SERIES_DAILY");
  } else {
    url.searchParams.set("function", "TIME_SERIES_INTRADAY");
    url.searchParams.set("interval", alphaVantageInterval(timeframe));
    url.searchParams.set("extended_hours", "false");
    url.searchParams.set("entitlement", "delayed");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Alpha Vantage request failed for ${symbol}: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const errorMessage = data["Error Message"] ?? data["Note"] ?? data["Information"];
  if (typeof errorMessage === "string") {
    throw new Error(`Alpha Vantage response for ${symbol}: ${errorMessage}`);
  }

  const seriesKey = Object.keys(data).find((key) => key.includes("Time Series"));
  const series = seriesKey ? (data[seriesKey] as Record<string, Record<string, string>>) : null;
  if (!series) {
    throw new Error(`Alpha Vantage returned no candles for ${symbol}.`);
  }

  return Object.entries(series)
    .map(([timestamp, candle]) => ({
      time: formatMarketTime(new Date(timestamp.replace(" ", "T"))),
      open: Number(candle["1. open"]),
      high: Number(candle["2. high"]),
      low: Number(candle["3. low"]),
      close: Number(candle["4. close"]),
      volume: Number(candle["5. volume"])
    }))
    .filter((candle) => [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite))
    .reverse();
}

function makeFeedStatus(provider: MarketDataProvider): FeedStatus {
  return {
    providerId: provider.id,
    providerLabel: provider.label,
    mode: provider.id === "mock" ? "mock" : "api",
    freshness: provider.freshness,
    configured: provider.configured,
    message: provider.description,
    sourceUrl: provider.sourceUrl
  };
}

function withFeedStatus(snapshot: MarketSnapshot, provider: MarketDataProvider): MarketSnapshot {
  return {
    ...snapshot,
    feedStatus: makeFeedStatus(provider)
  };
}

function finnhubResolution(timeframe: Timeframe): string {
  switch (timeframe) {
    case "1m":
      return "1";
    case "15m":
      return "15";
    case "1h":
      return "60";
    case "1d":
      return "D";
    case "5m":
    default:
      return "5";
  }
}

function yahooBaseUrl(): string {
  if (import.meta.env.VITE_YAHOO_CHART_BASE_URL) {
    return import.meta.env.VITE_YAHOO_CHART_BASE_URL;
  }

  if (import.meta.env.DEV) {
    return typeof window === "undefined" ? "http://127.0.0.1:5173/api/yahoo" : "/api/yahoo";
  }

  return "https://query1.finance.yahoo.com";
}

function yahooInterval(timeframe: Timeframe): string {
  switch (timeframe) {
    case "1m":
      return "1m";
    case "15m":
      return "15m";
    case "1h":
      return "60m";
    case "1d":
      return "1d";
    case "5m":
    default:
      return "5m";
  }
}

function yahooRange(timeframe: Timeframe): string {
  switch (timeframe) {
    case "1m":
      return "1d";
    case "5m":
      return "5d";
    case "15m":
      return "10d";
    case "1h":
      return "3mo";
    case "1d":
      return "6mo";
  }
}

function classifyContextTrend(symbol: string, changePercent: number, rsi: number) {
  if (symbol === "^VIX") {
    if (changePercent <= -1 || rsi < 45) {
      return "Supportive" as const;
    }

    if (changePercent >= 1.5 || rsi > 60) {
      return "Contradicting" as const;
    }

    return "Mixed" as const;
  }

  if (changePercent >= 0.25 || rsi > 55) {
    return "Supportive" as const;
  }

  if (changePercent <= -0.5 || rsi < 42) {
    return "Contradicting" as const;
  }

  return "Mixed" as const;
}

function alphaVantageInterval(timeframe: Exclude<Timeframe, "1d">): string {
  switch (timeframe) {
    case "1m":
      return "1min";
    case "15m":
      return "15min";
    case "1h":
      return "60min";
    case "5m":
    default:
      return "5min";
  }
}

function lookbackSeconds(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1m":
      return 60 * 60 * 8;
    case "5m":
      return 60 * 60 * 24 * 3;
    case "15m":
      return 60 * 60 * 24 * 8;
    case "1h":
      return 60 * 60 * 24 * 30;
    case "1d":
      return 60 * 60 * 24 * 160;
  }
}

function formatMarketTime(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
