import { calculateRSI } from "../src/lib/indicators";
import { getScannerUniverse } from "../src/lib/mockData";
import { normalizeSymbols } from "../src/lib/watchlist";
import { evaluateTicker } from "../src/lib/scoring";
import type { Candle, MarketContext, MarketSnapshot, ProviderId, TickerMeta, Timeframe } from "../src/types";

type ApiRequest = { method?: string; url?: string };
type ApiResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

type ServerProviderId = Exclude<ProviderId, "mock">;

interface ServerProvider {
  id: ServerProviderId;
  label: string;
  freshness: string;
  message: string;
  sourceUrl: string;
  isConfigured(env: Record<string, string>): boolean;
  configurationError: string;
  fetchBars(symbol: string, timeframe: Timeframe, env: Record<string, string>): Promise<Candle[]>;
}

const supportedTimeframes = new Set<Timeframe>(["1m", "5m", "15m", "1h", "1d"]);
const contextSymbols = new Set(["SPY", "QQQ", "IWM"]);
const barCache = new Map<string, { expiresAt: number; candles: Candle[] }>();

const providers: Record<ServerProviderId, ServerProvider> = {
  "alpaca-delayed-sip": {
    id: "alpaca-delayed-sip",
    label: "Alpaca Delayed SIP",
    freshness: "15-minute delayed SIP",
    message: "Delayed consolidated US stock and ETF candle data from Alpaca. Earnings dates and bid-ask spreads are not yet connected.",
    sourceUrl: "https://docs.alpaca.markets/us/docs/about-market-data-api",
    isConfigured: (env) => Boolean(env.ALPACA_API_KEY && env.ALPACA_API_SECRET),
    configurationError: "Alpaca is not configured. Add ALPACA_API_KEY and ALPACA_API_SECRET to .env.local, then restart npm run dev.",
    fetchBars: fetchAlpacaBars
  },
  "yahoo-public": {
    id: "yahoo-public",
    label: "Public Yahoo Chart (Experimental)",
    freshness: "Public feed timing varies",
    message: "No-key public chart candles for personal experimentation. This is an unofficial endpoint, may be delayed or interrupted, and is not used as a claim of consolidated market coverage.",
    sourceUrl: "https://finance.yahoo.com/",
    isConfigured: () => true,
    configurationError: "",
    fetchBars: fetchYahooBars
  }
};

export function createMarketApiHandler(env: Record<string, string>) {
  return async (request: ApiRequest, response: ApiResponse, next: () => void) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith("/api/market/")) {
      next();
      return;
    }

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Only GET is supported by the local market-data API." });
      return;
    }

    if (url.pathname === "/api/market/status") {
      sendJson(response, 200, {
        alpacaConfigured: providers["alpaca-delayed-sip"].isConfigured(env),
        publicYahooAvailable: true
      });
      return;
    }

    if (url.pathname !== "/api/market/snapshot") {
      sendJson(response, 404, { error: "Market-data endpoint not found." });
      return;
    }

    const timeframe = url.searchParams.get("timeframe") as Timeframe;
    const providerId = url.searchParams.get("provider") as ServerProviderId;
    const symbols = normalizeSymbols(url.searchParams.get("symbols") ?? "");
    const priceMin = Number(url.searchParams.get("priceMin"));
    const priceMax = Number(url.searchParams.get("priceMax"));
    if (!supportedTimeframes.has(timeframe)) {
      sendJson(response, 400, { error: "A supported timeframe is required." });
      return;
    }

    const provider = providers[providerId];
    if (!provider) {
      sendJson(response, 400, { error: "A supported market-data provider is required." });
      return;
    }

    if (symbols.length === 0 || !Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMin < 0 || priceMax < priceMin) {
      sendJson(response, 400, { error: "A non-empty watchlist and valid price range are required." });
      return;
    }

    if (!provider.isConfigured(env)) {
      sendJson(response, 503, { error: provider.configurationError });
      return;
    }

    try {
      sendJson(response, 200, await buildProviderSnapshot(provider, timeframe, symbols, priceMin, priceMax, env));
    } catch (error) {
      const message = error instanceof Error ? error.message : `${provider.label} scan failed.`;
      sendJson(response, 502, { error: message });
    }
  };
}

async function buildProviderSnapshot(
  provider: ServerProvider,
  timeframe: Timeframe,
  symbols: string[],
  priceMin: number,
  priceMax: number,
  env: Record<string, string>
): Promise<MarketSnapshot> {
  const referenceMetadata = new Map(getScannerUniverse().map((meta) => [meta.symbol, meta]));
  const watchlist = symbols
    .filter((symbol) => !contextSymbols.has(symbol))
    .map((symbol) => referenceMetadata.get(symbol) ?? createPersonalTickerMeta(symbol));
  const context = await buildProviderContext(provider, timeframe, env);
  const intradayResults = await allSettledWithConcurrency(watchlist, 3, (meta) => fetchCachedBars(provider, meta.symbol, timeframe, env));
  const unavailableSymbols = intradayResults.flatMap((result, index) => result.status === "rejected" ? [watchlist[index].symbol] : []);
  const priceEligible = intradayResults.flatMap((result, index) => {
    const latest = result.status === "fulfilled" ? result.value.at(-1) : null;
    return latest && latest.close >= priceMin && latest.close <= priceMax ? [{ meta: watchlist[index], candles: result.value }] : [];
  });
  const evaluatedResults = await allSettledWithConcurrency(priceEligible, 3, async ({ meta, candles }) => {
    const dailyCandles = await fetchCachedBars(provider, meta.symbol, "1d", env);
    return evaluateTicker(withLiveMetadata(meta, dailyCandles), candles, context, timeframe);
  });
  unavailableSymbols.push(...evaluatedResults.flatMap((result, index) => result.status === "rejected" ? [priceEligible[index].meta.symbol] : []));
  const opportunities = evaluatedResults
    .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    .sort((left, right) => right.score - left.score)
    .map((opportunity, index) => ({ ...opportunity, rank: index + 1 }));

  const latestCandleAt = opportunities.map((opportunity) => opportunity.lastUpdated).sort().at(-1) ?? null;

  return {
    timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    opportunities,
    context,
    feedStatus: {
      providerId: provider.id,
      providerLabel: provider.label,
      mode: "api",
      freshness: provider.freshness,
      configured: true,
      message: provider.message,
      sourceUrl: provider.sourceUrl,
      coverage: {
        requestedSymbols: symbols.length,
        priceEligibleSymbols: priceEligible.length,
        completedSymbols: opportunities.length,
        unavailableSymbols,
        latestCandleAt,
        metadataStatus: "partial-live"
      }
    }
  };
}

function createPersonalTickerMeta(symbol: string): TickerMeta {
  return {
    symbol,
    companyName: symbol,
    sector: "Personal watchlist",
    marketCap: 0,
    avgVolume: 0,
    spreadBps: 0,
    floatShares: 0,
    earningsInDays: null
  };
}

async function buildProviderContext(provider: ServerProvider, timeframe: Timeframe, env: Record<string, string>): Promise<MarketContext[]> {
  const symbols = ["SPY", "QQQ", "IWM"];
  const labels: Record<string, string> = { SPY: "Large-cap", QQQ: "Growth", IWM: "Small-cap" };
  const results = await allSettledWithConcurrency(symbols, 3, async (symbol) => {
    const candles = await fetchCachedBars(provider, symbol, timeframe, env);
    const first = candles[0];
    const latest = candles.at(-1);
    if (!first || !latest) {
      throw new Error(`${symbol} returned no context candles.`);
    }

    const changePercent = ((latest.close - first.close) / first.close) * 100;
    const rsi = calculateRSI(candles.map((candle) => candle.close)).at(-1) ?? 50;
    return {
      symbol,
      trend: classifyContextTrend(changePercent, rsi),
      changePercent,
      rsi,
      note: `${labels[symbol]} context from ${provider.label} candles.`
    };
  });

  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

async function fetchCachedBars(
  provider: ServerProvider,
  symbol: string,
  timeframe: Timeframe,
  env: Record<string, string>
): Promise<Candle[]> {
  const cacheKey = `${provider.id}:${symbol}:${timeframe}`;
  const now = Date.now();
  const cached = barCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.candles;
  }

  const candles = await provider.fetchBars(symbol, timeframe, env);
  barCache.set(cacheKey, { candles, expiresAt: now + cacheDurationMilliseconds(timeframe) });
  return candles;
}

function cacheDurationMilliseconds(timeframe: Timeframe): number {
  if (timeframe === "1d") {
    return 5 * 60 * 1000;
  }

  if (timeframe === "1m") {
    return 30 * 1000;
  }

  return 90 * 1000;
}

async function fetchAlpacaBars(symbol: string, timeframe: Timeframe, env: Record<string, string>): Promise<Candle[]> {
  const end = new Date();
  const start = new Date(end.getTime() - lookbackMilliseconds(timeframe));
  const url = new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);
  url.searchParams.set("timeframe", alpacaTimeframe(timeframe));
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("end", end.toISOString());
  url.searchParams.set("adjustment", "raw");
  url.searchParams.set("feed", "delayed_sip");
  url.searchParams.set("limit", "1000");

  const response = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": env.ALPACA_API_KEY,
      "APCA-API-SECRET-KEY": env.ALPACA_API_SECRET
    }
  });
  if (!response.ok) {
    throw new Error(`Alpaca request failed for ${symbol}: ${response.status}.`);
  }

  const payload = (await response.json()) as { bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> };
  return validateCandles(
    (payload.bars ?? []).map((bar) => ({ time: bar.t, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v })),
    symbol,
    timeframe,
    "Alpaca"
  );
}

async function fetchYahooBars(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", yahooRange(timeframe));
  url.searchParams.set("interval", yahooInterval(timeframe));
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "history");

  const response = await fetch(url, { headers: { "User-Agent": "MarketOpportunityEngine/0.1 personal research" } });
  if (!response.ok) {
    throw new Error(`Public Yahoo Chart request failed for ${symbol}: ${response.status}.`);
  }

  const payload = (await response.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> };
      }>;
    };
  };
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote?.open || !quote.high || !quote.low || !quote.close || !quote.volume) {
    throw new Error(`Public Yahoo Chart returned no candles for ${symbol}.`);
  }

  const candles = result.timestamp.map((timestamp, index) => ({
    time: new Date(timestamp * 1000).toISOString(),
    open: quote.open![index] ?? Number.NaN,
    high: quote.high![index] ?? Number.NaN,
    low: quote.low![index] ?? Number.NaN,
    close: quote.close![index] ?? Number.NaN,
    volume: quote.volume![index] ?? 0
  }));
  return validateCandles(candles, symbol, timeframe, "Public Yahoo Chart");
}

function validateCandles(candles: Candle[], symbol: string, timeframe: Timeframe, providerLabel: string): Candle[] {
  const validCandles = candles.filter((candle) =>
    [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
  );
  if (validCandles.length < 35) {
    throw new Error(`${providerLabel} returned insufficient ${timeframe} candles for ${symbol}.`);
  }
  return validCandles.slice(-180);
}

function withLiveMetadata(meta: TickerMeta, dailyCandles: Candle[]): TickerMeta {
  const sample = dailyCandles.slice(-20);
  const averageVolume = sample.reduce((sum, candle) => sum + candle.volume, 0) / sample.length;
  return {
    ...meta,
    avgVolume: Number.isFinite(averageVolume) ? averageVolume : 0,
    spreadBps: 0,
    floatShares: 0,
    earningsInDays: null
  };
}

function classifyContextTrend(changePercent: number, rsi: number): MarketContext["trend"] {
  if (changePercent >= 0.25 || rsi >= 55) {
    return "Supportive";
  }
  if (changePercent <= -0.5 || rsi <= 42) {
    return "Contradicting";
  }
  return "Mixed";
}

function alpacaTimeframe(timeframe: Timeframe): string {
  return timeframe === "1m" ? "1Min" : timeframe === "15m" ? "15Min" : timeframe === "1h" ? "1Hour" : timeframe === "1d" ? "1Day" : "5Min";
}

function yahooInterval(timeframe: Timeframe): string {
  return timeframe === "1m" ? "1m" : timeframe === "15m" ? "15m" : timeframe === "1h" ? "60m" : timeframe === "1d" ? "1d" : "5m";
}

function yahooRange(timeframe: Timeframe): string {
  return timeframe === "1m" ? "1d" : timeframe === "5m" ? "5d" : timeframe === "15m" ? "10d" : timeframe === "1h" ? "3mo" : "6mo";
}

function lookbackMilliseconds(timeframe: Timeframe): number {
  return timeframe === "1m"
    ? 1000 * 60 * 60 * 8
    : timeframe === "5m"
      ? 1000 * 60 * 60 * 24 * 4
      : timeframe === "15m"
        ? 1000 * 60 * 60 * 24 * 12
        : timeframe === "1h"
          ? 1000 * 60 * 60 * 24 * 45
          : 1000 * 60 * 60 * 24 * 160;
}

async function allSettledWithConcurrency<T, TResult>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<TResult>
): Promise<PromiseSettledResult<TResult>[]> {
  const results: PromiseSettledResult<TResult>[] = new Array(values.length);
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(values[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, runWorker));
  return results;
}

function sendJson(response: ApiResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
