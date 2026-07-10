import { evaluateTicker } from "./scoring";
import type { Candle, MarketContext, MarketSnapshot, TickerMeta, Timeframe } from "../types";

type Scenario = "bullish-confirmed" | "bullish-watch" | "bearish-confirmed" | "bearish-watch" | "neutral" | "squeeze";

interface MockTickerConfig extends TickerMeta {
  basePrice: number;
  scenario: Scenario;
  seed: number;
}

export const MOCK_TICKER_UNIVERSE: MockTickerConfig[] = [
  {
    symbol: "PLTR",
    companyName: "Palantir Technologies",
    sector: "Software",
    marketCap: 153000000000,
    avgVolume: 68000000,
    spreadBps: 8,
    floatShares: 2100000000,
    earningsInDays: 19,
    basePrice: 96,
    scenario: "bullish-confirmed",
    seed: 11
  },
  {
    symbol: "ACHR",
    companyName: "Archer Aviation",
    sector: "Industrials",
    marketCap: 6200000000,
    avgVolume: 21000000,
    spreadBps: 16,
    floatShares: 410000000,
    earningsInDays: 12,
    basePrice: 8.9,
    scenario: "bullish-watch",
    seed: 13
  },
  {
    symbol: "JOBY",
    companyName: "Joby Aviation",
    sector: "Industrials",
    marketCap: 9100000000,
    avgVolume: 18000000,
    spreadBps: 18,
    floatShares: 690000000,
    earningsInDays: 8,
    basePrice: 11.6,
    scenario: "bearish-watch",
    seed: 17
  },
  {
    symbol: "TSLA",
    companyName: "Tesla",
    sector: "Consumer Discretionary",
    marketCap: 880000000000,
    avgVolume: 92000000,
    spreadBps: 6,
    floatShares: 2790000000,
    earningsInDays: 24,
    basePrice: 271,
    scenario: "bearish-confirmed",
    seed: 19
  },
  {
    symbol: "RKLB",
    companyName: "Rocket Lab",
    sector: "Industrials",
    marketCap: 12200000000,
    avgVolume: 16000000,
    spreadBps: 15,
    floatShares: 520000000,
    earningsInDays: 5,
    basePrice: 24.4,
    scenario: "bullish-watch",
    seed: 23
  },
  {
    symbol: "ENVX",
    companyName: "Enovix",
    sector: "Technology Hardware",
    marketCap: 3100000000,
    avgVolume: 7400000,
    spreadBps: 21,
    floatShares: 170000000,
    earningsInDays: 3,
    basePrice: 16.8,
    scenario: "bullish-confirmed",
    seed: 29
  },
  {
    symbol: "AMPX",
    companyName: "Amprius Technologies",
    sector: "Technology Hardware",
    marketCap: 870000000,
    avgVolume: 1100000,
    spreadBps: 42,
    floatShares: 93000000,
    earningsInDays: 21,
    basePrice: 7.2,
    scenario: "bullish-watch",
    seed: 31
  },
  {
    symbol: "SOFI",
    companyName: "SoFi Technologies",
    sector: "Financials",
    marketCap: 18500000000,
    avgVolume: 57000000,
    spreadBps: 9,
    floatShares: 1080000000,
    earningsInDays: 14,
    basePrice: 16.4,
    scenario: "neutral",
    seed: 37
  },
  {
    symbol: "NVDA",
    companyName: "NVIDIA",
    sector: "Semiconductors",
    marketCap: 3720000000000,
    avgVolume: 230000000,
    spreadBps: 3,
    floatShares: 24400000000,
    earningsInDays: 31,
    basePrice: 151,
    scenario: "neutral",
    seed: 41
  },
  {
    symbol: "AMD",
    companyName: "Advanced Micro Devices",
    sector: "Semiconductors",
    marketCap: 247000000000,
    avgVolume: 62000000,
    spreadBps: 5,
    floatShares: 1620000000,
    earningsInDays: 10,
    basePrice: 152,
    scenario: "bearish-watch",
    seed: 43
  },
  {
    symbol: "IONQ",
    companyName: "IonQ",
    sector: "Quantum Computing",
    marketCap: 7300000000,
    avgVolume: 27000000,
    spreadBps: 12,
    floatShares: 221000000,
    earningsInDays: 6,
    basePrice: 36.5,
    scenario: "bullish-confirmed",
    seed: 47
  },
  {
    symbol: "RGTI",
    companyName: "Rigetti Computing",
    sector: "Quantum Computing",
    marketCap: 1800000000,
    avgVolume: 36000000,
    spreadBps: 28,
    floatShares: 310000000,
    earningsInDays: 2,
    basePrice: 14.2,
    scenario: "squeeze",
    seed: 53
  },
  {
    symbol: "SPY",
    companyName: "SPDR S&P 500 ETF",
    sector: "Index ETF",
    marketCap: 0,
    avgVolume: 82000000,
    spreadBps: 1,
    floatShares: 0,
    earningsInDays: null,
    basePrice: 642,
    scenario: "neutral",
    seed: 59
  },
  {
    symbol: "QQQ",
    companyName: "Invesco QQQ Trust",
    sector: "Index ETF",
    marketCap: 0,
    avgVolume: 61000000,
    spreadBps: 1,
    floatShares: 0,
    earningsInDays: null,
    basePrice: 565,
    scenario: "neutral",
    seed: 61
  },
  {
    symbol: "IWM",
    companyName: "iShares Russell 2000 ETF",
    sector: "Index ETF",
    marketCap: 0,
    avgVolume: 39000000,
    spreadBps: 2,
    floatShares: 0,
    earningsInDays: null,
    basePrice: 224,
    scenario: "neutral",
    seed: 67
  }
];

export function buildMockSnapshot(timeframe: Timeframe = "5m"): MarketSnapshot {
  const context = buildMarketContext();
  const opportunities = MOCK_TICKER_UNIVERSE.map((ticker) => {
    const candles = generateCandles(ticker, timeframe);
    return evaluateTicker(ticker, candles, context, timeframe);
  })
    .sort((a, b) => b.score - a.score)
    .map((opportunity, index) => ({
      ...opportunity,
      rank: index + 1
    }));

  return {
    timestamp: opportunities[0]?.lastUpdated ?? new Date().toLocaleTimeString(),
    opportunities,
    context,
    feedStatus: {
      providerId: "mock",
      providerLabel: "Mock Market Stream",
      mode: "mock",
      freshness: "Simulated",
      configured: true,
      message: "Deterministic simulated candles for strategy, UI, and scoring development."
    }
  };
}

export function buildMarketContext(): MarketContext[] {
  return [
    {
      symbol: "SPY",
      trend: "Mixed",
      changePercent: -0.18,
      rsi: 48.6,
      note: "Large-cap breadth is neutral with light pressure near VWAP."
    },
    {
      symbol: "QQQ",
      trend: "Supportive",
      changePercent: 0.34,
      rsi: 55.4,
      note: "Growth names are holding above intraday VWAP."
    },
    {
      symbol: "IWM",
      trend: "Mixed",
      changePercent: -0.42,
      rsi: 45.1,
      note: "Small caps are lagging but not in a broad risk-off break."
    },
    {
      symbol: "VIX",
      trend: "Supportive",
      changePercent: -2.1,
      rsi: 41.2,
      note: "Volatility is easing, which supports orderly mean-reversion attempts."
    }
  ];
}

export function getScannerUniverse(): TickerMeta[] {
  return MOCK_TICKER_UNIVERSE.map(({ basePrice: _basePrice, scenario: _scenario, seed: _seed, ...meta }) => meta);
}

function generateCandles(config: MockTickerConfig, timeframe: Timeframe): Candle[] {
  const count = timeframe === "1d" ? 90 : 116;
  const candles: Candle[] = [];
  const random = createRandom(config.seed);
  const start = new Date("2026-07-09T09:30:00");
  let close = config.basePrice;

  for (let index = 0; index < count; index += 1) {
    const drift = getBaseDrift(config.scenario, index, count);
    const noise = (random() - 0.5) * config.basePrice * 0.006;
    const previousClose = close;
    close = Math.max(0.5, close + drift + noise);
    const range = Math.max(config.basePrice * (0.005 + random() * 0.012), 0.04);
    const open = previousClose + (random() - 0.5) * range;
    const high = Math.max(open, close) + range * (0.35 + random() * 0.55);
    const low = Math.min(open, close) - range * (0.35 + random() * 0.55);
    const volumeBase = config.avgVolume / 78;
    const volume = Math.round(volumeBase * (0.75 + random() * 0.65));

    candles.push({
      time: formatTime(addMinutes(start, index * timeframeToMinutes(timeframe))),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume
    });
  }

  applyScenarioShape(candles, config);
  return candles;
}

function applyScenarioShape(candles: Candle[], config: MockTickerConfig): void {
  const count = candles.length;
  const start = Math.max(35, count - 34);
  const price = config.basePrice;

  if (config.scenario === "squeeze") {
    for (let index = count - 38; index < count; index += 1) {
      const candle = candles[index];
      const compressed = price * (1 + Math.sin(index) * 0.002);
      updateCandle(candle, compressed, compressed + price * 0.003, compressed - price * 0.003, config.avgVolume / 120);
    }

    return;
  }

  if (config.scenario === "neutral") {
    return;
  }

  const bullish = config.scenario === "bullish-confirmed" || config.scenario === "bullish-watch";
  const confirmed = config.scenario === "bullish-confirmed" || config.scenario === "bearish-confirmed";
  const shape = bullish ? bullishShape(price, confirmed) : bearishShape(price, confirmed);

  shape.forEach((close, offset) => {
    const index = start + offset;
    const candle = candles[index];
    if (!candle) {
      return;
    }

    const priorClose = candles[index - 1]?.close ?? close;
    const range = Math.max(price * (0.008 + offset * 0.0002), 0.04);
    const high = Math.max(priorClose, close) + range * 0.6;
    const low = Math.min(priorClose, close) - range * 0.6;
    const volumeBoost = offset > shape.length - 8 ? 2.2 : offset > shape.length - 16 ? 1.4 : 1;
    updateCandle(candle, close, high, low, (config.avgVolume / 78) * volumeBoost);
  });
}

function bullishShape(price: number, confirmed: boolean): number[] {
  const factors = [
    1,
    0.982,
    0.956,
    0.923,
    0.884,
    0.842,
    0.802,
    0.815,
    0.836,
    0.858,
    0.881,
    0.904,
    0.892,
    0.881,
    0.871,
    0.862,
    0.854,
    0.846,
    0.838,
    0.831,
    0.824,
    0.818,
    0.812,
    0.807,
    0.803,
    0.799,
    0.795,
    0.792,
    confirmed ? 0.794 : 0.789,
    confirmed ? 0.797 : 0.786,
    confirmed ? 0.801 : 0.783,
    confirmed ? 0.806 : 0.78,
    confirmed ? 0.812 : 0.777,
    confirmed ? 0.819 : 0.774
  ];

  return factors.map((factor) => price * factor);
}

function bearishShape(price: number, confirmed: boolean): number[] {
  const factors = [
    1,
    1.018,
    1.044,
    1.077,
    1.116,
    1.158,
    1.198,
    1.185,
    1.164,
    1.142,
    1.119,
    1.096,
    1.108,
    1.119,
    1.129,
    1.138,
    1.146,
    1.154,
    1.162,
    1.169,
    1.176,
    1.182,
    1.188,
    1.193,
    1.197,
    1.201,
    1.205,
    1.208,
    confirmed ? 1.206 : 1.211,
    confirmed ? 1.203 : 1.214,
    confirmed ? 1.199 : 1.217,
    confirmed ? 1.194 : 1.22,
    confirmed ? 1.188 : 1.223,
    confirmed ? 1.181 : 1.226
  ];

  return factors.map((factor) => price * factor);
}

function updateCandle(candle: Candle, close: number, high: number, low: number, volume: number): void {
  const open = (candle.open + close) / 2;
  candle.open = round(open);
  candle.close = round(close);
  candle.high = round(Math.max(high, open, close));
  candle.low = round(Math.min(low, open, close));
  candle.volume = Math.round(volume);
}

function getBaseDrift(scenario: Scenario, index: number, count: number): number {
  const progress = index / count;

  if (scenario.includes("bullish")) {
    return progress < 0.7 ? -0.035 : -0.012;
  }

  if (scenario.includes("bearish")) {
    return progress < 0.7 ? 0.035 : 0.012;
  }

  if (scenario === "squeeze") {
    return 0.001;
  }

  return Math.sin(index / 8) * 0.015;
}

function createRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function timeframeToMinutes(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1m":
      return 1;
    case "15m":
      return 15;
    case "1h":
      return 60;
    case "1d":
      return 1440;
    case "5m":
    default:
      return 5;
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
