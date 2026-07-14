import { buildMarketContext, getScannerUniverse } from "../src/lib/mockData";
import { evaluateTicker } from "../src/lib/scoring";
import type { Candle, MarketContext, MarketSnapshot, TickerMeta, Timeframe } from "../src/types";

type ApiRequest = { method?: string; url?: string };
type ApiResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

const supportedTimeframes = new Set<Timeframe>(["1m", "5m", "15m", "1h", "1d"]);
const contextSymbols = new Set(["SPY", "QQQ", "IWM"]);

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
        alpacaConfigured: Boolean(env.ALPACA_API_KEY && env.ALPACA_API_SECRET),
        provider: "Alpaca Delayed SIP"
      });
      return;
    }

    if (url.pathname !== "/api/market/snapshot") {
      sendJson(response, 404, { error: "Market-data endpoint not found." });
      return;
    }

    const timeframe = url.searchParams.get("timeframe") as Timeframe;
    if (!supportedTimeframes.has(timeframe)) {
      sendJson(response, 400, { error: "A supported timeframe is required." });
      return;
    }

    if (!env.ALPACA_API_KEY || !env.ALPACA_API_SECRET) {
      sendJson(response, 503, {
        error: "Alpaca is not configured. Add ALPACA_API_KEY and ALPACA_API_SECRET to .env.local, then restart npm run dev."
      });
      return;
    }

    try {
      const snapshot = await buildAlpacaSnapshot(timeframe, env);
      sendJson(response, 200, snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The Alpaca scan failed.";
      sendJson(response, 502, { error: message });
    }
  };
}

async function buildAlpacaSnapshot(timeframe: Timeframe, env: Record<string, string>): Promise<MarketSnapshot> {
  const watchlist = getScannerUniverse().filter((meta) => !contextSymbols.has(meta.symbol));
  const watchlistResults = await Promise.allSettled(
    watchlist.map(async (meta) => {
      const [candles, dailyCandles] = await Promise.all([
        fetchAlpacaBars(meta.symbol, timeframe, env),
        fetchAlpacaBars(meta.symbol, "1d", env)
      ]);
      const liveMeta = withLiveMetadata(meta, dailyCandles);
      return evaluateTicker(liveMeta, candles, [], timeframe);
    })
  );

  const unavailableSymbols = watchlistResults.flatMap((result, index) =>
    result.status === "rejected" ? [watchlist[index].symbol] : []
  );
  const successfulOpportunities = watchlistResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

  if (successfulOpportunities.length === 0) {
    throw new Error("Alpaca returned no usable data for the starter watchlist.");
  }

  const context = await buildAlpacaContext(timeframe, env);
  const opportunities = successfulOpportunities
    .map((opportunity) => ({
      ...opportunity,
      scoreBreakdown: {
        ...opportunity.scoreBreakdown,
        marketContext: getContextPoints(opportunity.side, context)
      }
    }))
    .map((opportunity) => {
      const score = Math.max(0, Math.min(100, Object.values(opportunity.scoreBreakdown).reduce((sum, value) => sum + value, 0)));
      return { ...opportunity, score };
    })
    .sort((left, right) => right.score - left.score)
    .map((opportunity, index) => ({ ...opportunity, rank: index + 1 }));

  const latestCandleAt = opportunities
    .map((opportunity) => opportunity.lastUpdated)
    .sort()
    .at(-1) ?? null;

  return {
    timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    opportunities,
    context,
    feedStatus: {
      providerId: "alpaca-delayed-sip",
      providerLabel: "Alpaca Delayed SIP",
      mode: "api",
      freshness: "15-minute delayed SIP",
      configured: true,
      message: "Delayed consolidated US stock and ETF candle data from Alpaca. Earnings dates and bid-ask spreads are not yet connected.",
      sourceUrl: "https://docs.alpaca.markets/us/docs/about-market-data-api",
      coverage: {
        requestedSymbols: watchlist.length,
        completedSymbols: opportunities.length,
        unavailableSymbols,
        latestCandleAt,
        metadataStatus: "partial-live"
      }
    }
  };
}

async function buildAlpacaContext(timeframe: Timeframe, env: Record<string, string>): Promise<MarketContext[]> {
  const baseline = buildMarketContext().filter((item) => contextSymbols.has(item.symbol));
  const settled = await Promise.allSettled(
    baseline.map(async (item) => {
      const candles = await fetchAlpacaBars(item.symbol, timeframe, env);
      const first = candles[0];
      const latest = candles.at(-1);
      if (!first || !latest) {
        throw new Error(`${item.symbol} returned no context candles.`);
      }

      const changePercent = ((latest.close - first.close) / first.close) * 100;
      return {
        ...item,
        changePercent,
        note: `${item.symbol} context from delayed SIP candles.`
      };
    })
  );

  return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
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
  const candles = (payload.bars ?? [])
    .map((bar) => ({ time: bar.t, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v }))
    .filter((bar) => [bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite));

  if (candles.length < 35) {
    throw new Error(`Alpaca returned insufficient ${timeframe} candles for ${symbol}.`);
  }

  return candles;
}

function withLiveMetadata(meta: TickerMeta, dailyCandles: Candle[]): TickerMeta {
  const averageVolume = dailyCandles.slice(-20).reduce((sum, candle) => sum + candle.volume, 0) / Math.min(dailyCandles.length, 20);
  return {
    ...meta,
    avgVolume: Number.isFinite(averageVolume) ? averageVolume : 0,
    spreadBps: 0,
    floatShares: 0,
    earningsInDays: null
  };
}

function getContextPoints(side: "bullish" | "bearish" | "neutral", context: MarketContext[]): number {
  if (side === "neutral") {
    return 0;
  }

  const positive = context.filter((item) => item.changePercent > 0).length;
  const negative = context.filter((item) => item.changePercent < 0).length;
  if (side === "bullish" && positive >= 2) {
    return 5;
  }
  if (side === "bearish" && negative >= 2) {
    return 5;
  }
  return 0;
}

function alpacaTimeframe(timeframe: Timeframe): string {
  switch (timeframe) {
    case "1m":
      return "1Min";
    case "15m":
      return "15Min";
    case "1h":
      return "1Hour";
    case "1d":
      return "1Day";
    case "5m":
    default:
      return "5Min";
  }
}

function lookbackMilliseconds(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1m":
      return 1000 * 60 * 60 * 8;
    case "5m":
      return 1000 * 60 * 60 * 24 * 4;
    case "15m":
      return 1000 * 60 * 60 * 24 * 12;
    case "1h":
      return 1000 * 60 * 60 * 24 * 45;
    case "1d":
      return 1000 * 60 * 60 * 24 * 160;
  }
}

function sendJson(response: ApiResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
