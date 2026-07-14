import {
  buildIndicatorPoints,
  detectBearishDivergence,
  detectBullishDivergence
} from "./indicators";
import type {
  AlertEvent,
  BollingerStatus,
  Candle,
  DivergenceResult,
  MarketContext,
  Opportunity,
  ScoreBreakdown,
  SignalSide,
  SignalState,
  SignalType,
  TickerMeta,
  Timeframe,
  VwapStatus
} from "../types";

export function evaluateTicker(
  meta: TickerMeta,
  candles: Candle[],
  marketContext: MarketContext[],
  timeframe: Timeframe,
  rank = 0
): Opportunity {
  const points = buildIndicatorPoints(candles);
  const latest = points[points.length - 1];
  const previous = points[points.length - 2] ?? latest;
  const bullishDivergence = detectBullishDivergence(points);
  const bearishDivergence = detectBearishDivergence(points);
  const bollingerStatus = getBollingerStatus(latest);
  const vwapStatus = getVwapStatus(latest, previous);
  const side = getSignalSide(latest, bollingerStatus, bullishDivergence, bearishDivergence);
  const divergence = side === "bearish" ? bearishDivergence : bullishDivergence;
  const squeeze = Boolean(latest.bandWidth !== null && latest.bandWidth < 3.4);
  const liquidityWarning = getLiquidityWarning(meta);
  const contextPoints = getMarketContextPoints(side, marketContext);
  const scoreBreakdown = getScoreBreakdown({
    latest,
    bollingerStatus,
    divergence,
    vwapStatus,
    side,
    squeeze,
    contextPoints
  });
  const rawScore = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const penalty = getPenalty(meta, latest.relativeVolume, squeeze, side);
  const score = Math.max(0, Math.min(100, rawScore - penalty));
  const state = getSignalState(score, side, vwapStatus, bollingerStatus, latest, previous);
  const signalType = getSignalType(side, state);
  const risk = getRiskZones(latest, side);
  const warnings = getWarnings(meta, latest.relativeVolume, squeeze, marketContext, side);

  return {
    rank,
    symbol: meta.symbol,
    companyName: meta.companyName,
    sector: meta.sector,
    currentPrice: latest.close,
    signalType,
    side,
    state,
    score,
    alertLevel: getAlertLevel(score),
    rsi: latest.rsi,
    bollingerStatus,
    divergence,
    relativeVolume: latest.relativeVolume,
    vwapStatus,
    spreadBps: meta.spreadBps,
    liquidityWarning,
    lastUpdated: latest.time,
    timeframe,
    explanation: buildExplanation(meta.symbol, signalType, latest, bollingerStatus, divergence, vwapStatus, score),
    timeline: buildTimeline(latest, bollingerStatus, divergence, vwapStatus, score, side),
    scoreBreakdown,
    chartData: points,
    risk,
    warnings,
    meta
  };
}

function getScoreBreakdown(input: {
  latest: ReturnType<typeof buildIndicatorPoints>[number];
  bollingerStatus: BollingerStatus;
  divergence: DivergenceResult;
  vwapStatus: VwapStatus;
  side: SignalSide;
  squeeze: boolean;
  contextPoints: number;
}): ScoreBreakdown {
  const { latest, bollingerStatus, divergence, vwapStatus, side, squeeze, contextPoints } = input;
  const bullishBand = bollingerStatus === "Lower Band Touch" || bollingerStatus === "Lower Band Break";
  const bearishBand = bollingerStatus === "Upper Band Touch" || bollingerStatus === "Upper Band Break";
  const rsi = latest.rsi ?? 50;
  const relVol = latest.relativeVolume ?? 0;

  return {
    bollinger: side === "bullish" && bullishBand ? 20 : side === "bearish" && bearishBand ? 20 : 0,
    rsi: side === "bullish" && rsi <= 25 ? 20 : side === "bearish" && rsi >= 75 ? 20 : 0,
    divergence:
      divergence.type === "None"
        ? 0
        : divergence.strength >= 70
          ? 25
          : divergence.strength >= 40
            ? 20
            : 15,
    volume: relVol >= 1.8 ? 15 : relVol >= 1.25 ? 10 : relVol >= 1 ? 5 : 0,
    vwap:
      side === "bullish" && vwapStatus === "Reclaimed VWAP"
        ? 10
        : side === "bearish" && vwapStatus === "Rejected VWAP"
          ? 10
          : 0,
    volatility: squeeze ? 0 : 5,
    marketContext: contextPoints
  };
}

function getBollingerStatus(latest: ReturnType<typeof buildIndicatorPoints>[number]): BollingerStatus {
  if (latest.upperBand === null || latest.lowerBand === null) {
    return "Inside Bands";
  }

  const range = Math.max(latest.high - latest.low, 0.01);
  const touchBuffer = range * 0.2;

  if (latest.close < latest.lowerBand) {
    return "Lower Band Break";
  }

  if (latest.low <= latest.lowerBand + touchBuffer) {
    return "Lower Band Touch";
  }

  if (latest.close > latest.upperBand) {
    return "Upper Band Break";
  }

  if (latest.high >= latest.upperBand - touchBuffer) {
    return "Upper Band Touch";
  }

  return "Inside Bands";
}

function getVwapStatus(
  latest: ReturnType<typeof buildIndicatorPoints>[number],
  previous: ReturnType<typeof buildIndicatorPoints>[number]
): VwapStatus {
  if (latest.vwap === null || previous.vwap === null) {
    return "Below VWAP";
  }

  if (previous.close < previous.vwap && latest.close >= latest.vwap) {
    return "Reclaimed VWAP";
  }

  if (previous.close > previous.vwap && latest.close <= latest.vwap) {
    return "Rejected VWAP";
  }

  return latest.close >= latest.vwap ? "Above VWAP" : "Below VWAP";
}

function getSignalSide(
  latest: ReturnType<typeof buildIndicatorPoints>[number],
  bollingerStatus: BollingerStatus,
  bullishDivergence: DivergenceResult,
  bearishDivergence: DivergenceResult
): SignalSide {
  const rsi = latest.rsi ?? 50;
  const bullishBand = bollingerStatus === "Lower Band Touch" || bollingerStatus === "Lower Band Break";
  const bearishBand = bollingerStatus === "Upper Band Touch" || bollingerStatus === "Upper Band Break";

  if ((bullishBand || rsi <= 28) && bullishDivergence.type === "Bullish") {
    return "bullish";
  }

  if ((bearishBand || rsi >= 72) && bearishDivergence.type === "Bearish") {
    return "bearish";
  }

  if (bullishBand && rsi <= 25) {
    return "bullish";
  }

  if (bearishBand && rsi >= 75) {
    return "bearish";
  }

  return "neutral";
}

function getSignalState(
  score: number,
  side: SignalSide,
  vwapStatus: VwapStatus,
  bollingerStatus: BollingerStatus,
  latest: ReturnType<typeof buildIndicatorPoints>[number],
  previous: ReturnType<typeof buildIndicatorPoints>[number]
): SignalState {
  if (side === "neutral" || score < 60) {
    return "none";
  }

  if (side === "bullish" && latest.close < previous.low && (latest.rsi ?? 50) < 20) {
    return "invalidated";
  }

  if (side === "bearish" && latest.close > previous.high && (latest.rsi ?? 50) > 82) {
    return "invalidated";
  }

  const closedBackInsideLower =
    side === "bullish" &&
    latest.lowerBand !== null &&
    previous.close < previous.lowerBand! &&
    latest.close > latest.lowerBand;
  const closedBackInsideUpper =
    side === "bearish" &&
    latest.upperBand !== null &&
    previous.close > previous.upperBand! &&
    latest.close < latest.upperBand;

  if (side === "bullish" && (vwapStatus === "Reclaimed VWAP" || closedBackInsideLower)) {
    return "confirmed";
  }

  if (side === "bearish" && (vwapStatus === "Rejected VWAP" || closedBackInsideUpper)) {
    return "confirmed";
  }

  if (bollingerStatus !== "Inside Bands") {
    return "watch";
  }

  return score >= 60 ? "watch" : "none";
}

function getSignalType(side: SignalSide, state: SignalState): SignalType {
  if (state === "invalidated") {
    return "Invalidated";
  }

  if (side === "bullish" && state === "confirmed") {
    return "Bounce Confirmed";
  }

  if (side === "bullish" && state === "watch") {
    return "Bounce Watch";
  }

  if (side === "bearish" && state === "confirmed") {
    return "Pullback Confirmed";
  }

  if (side === "bearish" && state === "watch") {
    return "Pullback Watch";
  }

  return "No Alert";
}

function getPenalty(
  meta: TickerMeta,
  relativeVolume: number | null,
  squeeze: boolean,
  side: SignalSide
): number {
  let penalty = 0;

  if (side === "neutral") {
    penalty += 20;
  }

  if (squeeze) {
    penalty += 15;
  }

  if ((relativeVolume ?? 0) < 0.75) {
    penalty += 10;
  }

  if (meta.avgVolume < 500000) {
    penalty += 8;
  }

  if (meta.spreadBps > 35) {
    penalty += 10;
  }

  if (meta.earningsInDays !== null && meta.earningsInDays <= 3) {
    penalty += 8;
  }

  return penalty;
}

function getMarketContextPoints(side: SignalSide, context: MarketContext[]): number {
  if (side === "neutral") {
    return 0;
  }

  const supportiveCount = context.filter((item) => item.trend === "Supportive").length;
  const contradictingCount = context.filter((item) => item.trend === "Contradicting").length;

  if (supportiveCount >= 2 && contradictingCount === 0) {
    return 5;
  }

  if (contradictingCount >= 2) {
    return 0;
  }

  return 3;
}

function getLiquidityWarning(meta: TickerMeta): string | null {
  if (meta.spreadBps > 45) {
    return "Wide spread";
  }

  if (meta.avgVolume < 500000) {
    return "Thin volume";
  }

  if (meta.floatShares > 0 && meta.floatShares < 25000000) {
    return "Low float";
  }

  return null;
}

function getAlertLevel(score: number): Opportunity["alertLevel"] {
  if (score >= 90) {
    return "Very High Interest";
  }

  if (score >= 80) {
    return "High Interest";
  }

  if (score >= 70) {
    return "Watch Closely";
  }

  if (score >= 60) {
    return "Early Watch";
  }

  return "No Alert";
}

function buildExplanation(
  symbol: string,
  signalType: SignalType,
  latest: ReturnType<typeof buildIndicatorPoints>[number],
  bollingerStatus: BollingerStatus,
  divergence: DivergenceResult,
  vwapStatus: VwapStatus,
  score: number
): string {
  const rsiText = latest.rsi === null ? "unavailable" : latest.rsi.toFixed(1);
  const relVolText = latest.relativeVolume === null ? "unavailable" : `${latest.relativeVolume.toFixed(2)}x normal`;

  return `${symbol} triggered a ${signalType}. Price is showing ${bollingerStatus.toLowerCase()}. RSI is ${rsiText}. Divergence is ${divergence.type.toLowerCase()} with strength ${divergence.strength}/100. Relative volume is ${relVolText}. VWAP status is ${vwapStatus.toLowerCase()}. Overall opportunity score is ${score}/100. This is a watchlist alert, not a trade recommendation.`;
}

function buildTimeline(
  latest: ReturnType<typeof buildIndicatorPoints>[number],
  bollingerStatus: BollingerStatus,
  divergence: DivergenceResult,
  vwapStatus: VwapStatus,
  score: number,
  side: SignalSide
): AlertEvent[] {
  const events: AlertEvent[] = [];
  const time = latest.time;

  if (bollingerStatus !== "Inside Bands") {
    events.push({
      time,
      label: `Price registered ${bollingerStatus.toLowerCase()}`,
      severity: "watch"
    });
  }

  if (latest.rsi !== null && (latest.rsi <= 25 || latest.rsi >= 75)) {
    events.push({
      time,
      label: `RSI reached ${latest.rsi.toFixed(1)}`,
      severity: "watch"
    });
  }

  if (divergence.type !== "None") {
    events.push({
      time,
      label: `${divergence.type} divergence detected across ${Math.min(divergence.swingCount, 3)} recent swing points`,
      severity: "confirm"
    });
  }

  if (latest.relativeVolume !== null && latest.relativeVolume >= 1.25) {
    events.push({
      time,
      label: `Relative volume rose to ${latest.relativeVolume.toFixed(2)}x`,
      severity: "info"
    });
  }

  if (
    (side === "bullish" && vwapStatus === "Reclaimed VWAP") ||
    (side === "bearish" && vwapStatus === "Rejected VWAP")
  ) {
    events.push({
      time,
      label: `VWAP confirmation: ${vwapStatus.toLowerCase()}`,
      severity: "confirm"
    });
  }

  if (score >= 60) {
    events.push({
      time,
      label: `Opportunity score moved to ${score}/100`,
      severity: score >= 80 ? "confirm" : "info"
    });
  }

  return events.length > 0
    ? events
    : [
        {
          time,
          label: "No complete alert condition yet",
          severity: "info"
        }
      ];
}

function getRiskZones(latest: ReturnType<typeof buildIndicatorPoints>[number], side: SignalSide) {
  const atr = latest.atr ?? Math.max(latest.high - latest.low, latest.close * 0.01);
  const midline = latest.sma ?? latest.close;
  const vwap = latest.vwap ?? latest.close;

  if (side === "bearish") {
    const invalidation = latest.high + atr * 0.65;
    const firstTarget = Math.min(midline, latest.close - atr);
    const secondTarget = Math.min(vwap, firstTarget - atr * 0.75);
    const risk = Math.max(invalidation - latest.close, 0.01);
    const reward = Math.max(latest.close - firstTarget, 0.01);

    return {
      invalidation,
      firstTarget,
      secondTarget,
      atr,
      riskReward: reward / risk
    };
  }

  const invalidation = latest.low - atr * 0.65;
  const firstTarget = Math.max(midline, latest.close + atr);
  const secondTarget = Math.max(vwap, firstTarget + atr * 0.75);
  const risk = Math.max(latest.close - invalidation, 0.01);
  const reward = Math.max(firstTarget - latest.close, 0.01);

  return {
    invalidation,
    firstTarget,
    secondTarget,
    atr,
    riskReward: reward / risk
  };
}

function getWarnings(
  meta: TickerMeta,
  relativeVolume: number | null,
  squeeze: boolean,
  context: MarketContext[],
  side: SignalSide
): string[] {
  const warnings: string[] = [];

  if (squeeze) {
    warnings.push("Bollinger Band squeeze reduces reversal quality.");
  }

  if ((relativeVolume ?? 0) < 0.75) {
    warnings.push("Relative volume is below preferred alert threshold.");
  }

  if (meta.spreadBps > 35) {
    warnings.push("Spread is wide enough to reduce signal quality.");
  }

  if (meta.earningsInDays !== null && meta.earningsInDays <= 3) {
    warnings.push("Earnings are close enough to add event risk.");
  }

  if (side !== "neutral" && context.filter((item) => item.trend === "Contradicting").length >= 2) {
    warnings.push("Broader market context contradicts the setup.");
  }

  return warnings;
}
