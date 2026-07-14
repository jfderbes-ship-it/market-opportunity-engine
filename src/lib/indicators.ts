import type { Candle, DivergenceResult, DivergenceType, IndicatorPoint, SwingPoint } from "../types";

export function calculateSMA(values: number[], period: number): Array<number | null> {
  return values.map((_, index) => {
    if (index < period - 1) {
      return null;
    }

    const window = values.slice(index - period + 1, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / period;
  });
}

export function calculateStandardDeviation(values: number[], period: number): Array<number | null> {
  return values.map((_, index) => {
    if (index < period - 1) {
      return null;
    }

    const window = values.slice(index - period + 1, index + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    return Math.sqrt(variance);
  });
}

export function calculateBollingerBands(values: number[], period = 30, standardDeviations = 2) {
  const sma = calculateSMA(values, period);
  const deviations = calculateStandardDeviation(values, period);

  return values.map((_, index) => {
    const middle = sma[index];
    const deviation = deviations[index];

    if (middle === null || deviation === null) {
      return {
        sma: null,
        upperBand: null,
        lowerBand: null,
        bandWidth: null
      };
    }

    const upperBand = middle + standardDeviations * deviation;
    const lowerBand = middle - standardDeviations * deviation;

    return {
      sma: middle,
      upperBand,
      lowerBand,
      bandWidth: ((upperBand - lowerBand) / middle) * 100
    };
  });
}

export function calculateRSI(values: number[], period = 13): Array<number | null> {
  if (values.length <= period) {
    return values.map(() => null);
  }

  const rsi: Array<number | null> = values.map(() => null);
  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  rsi[period] = toRsiValue(averageGain, averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    rsi[index] = toRsiValue(averageGain, averageLoss);
  }

  return rsi;
}

function toRsiValue(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

export function calculateVWAP(candles: Candle[]): Array<number | null> {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;
  let sessionKey: string | null = null;

  return candles.map((candle) => {
    const nextSessionKey = getMarketSessionKey(candle.time);
    if (sessionKey !== nextSessionKey) {
      cumulativePriceVolume = 0;
      cumulativeVolume = 0;
      sessionKey = nextSessionKey;
    }

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePriceVolume += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;

    return cumulativeVolume === 0 ? null : cumulativePriceVolume / cumulativeVolume;
  });
}

function getMarketSessionKey(time: string): string {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    return "single-session";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const valueFor = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
}

export function calculateATR(candles: Candle[], period = 14): Array<number | null> {
  const trueRanges = candles.map((candle, index) => {
    if (index === 0) {
      return candle.high - candle.low;
    }

    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  return calculateSMA(trueRanges, period);
}

export function calculateRelativeVolume(candles: Candle[], period = 20): Array<number | null> {
  return candles.map((candle, index) => {
    if (index < period) {
      return null;
    }

    const priorVolume = candles
      .slice(index - period, index)
      .reduce((sum, priorCandle) => sum + priorCandle.volume, 0);
    const averageVolume = priorVolume / period;

    return averageVolume === 0 ? null : candle.volume / averageVolume;
  });
}

export function buildIndicatorPoints(candles: Candle[]): IndicatorPoint[] {
  const closes = candles.map((candle) => candle.close);
  const bands = calculateBollingerBands(closes);
  const rsi = calculateRSI(closes);
  const vwap = calculateVWAP(candles);
  const atr = calculateATR(candles);
  const relativeVolume = calculateRelativeVolume(candles);

  return candles.map((candle, index) => ({
    ...candle,
    sma: bands[index].sma,
    upperBand: bands[index].upperBand,
    lowerBand: bands[index].lowerBand,
    bandWidth: bands[index].bandWidth,
    rsi: rsi[index],
    vwap: vwap[index],
    atr: atr[index],
    relativeVolume: relativeVolume[index]
  }));
}

export function detectSwingLows(points: IndicatorPoint[], lookback = 3): SwingPoint[] {
  const swings: SwingPoint[] = [];

  for (let index = lookback; index < points.length - lookback; index += 1) {
    const point = points[index];
    if (point.rsi === null) {
      continue;
    }

    const neighbors = points.slice(index - lookback, index + lookback + 1);
    const isSwingLow = neighbors.every((neighbor) => point.low <= neighbor.low);

    if (isSwingLow) {
      swings.push({
        index,
        price: point.low,
        rsi: point.rsi,
        time: point.time
      });
    }
  }

  return swings;
}

export function detectSwingHighs(points: IndicatorPoint[], lookback = 3): SwingPoint[] {
  const swings: SwingPoint[] = [];

  for (let index = lookback; index < points.length - lookback; index += 1) {
    const point = points[index];
    if (point.rsi === null) {
      continue;
    }

    const neighbors = points.slice(index - lookback, index + lookback + 1);
    const isSwingHigh = neighbors.every((neighbor) => point.high >= neighbor.high);

    if (isSwingHigh) {
      swings.push({
        index,
        price: point.high,
        rsi: point.rsi,
        time: point.time
      });
    }
  }

  return swings;
}

export function detectBullishDivergence(points: IndicatorPoint[]): DivergenceResult {
  const swingLows = withRecentLowCandidate(points, detectSwingLows(points)).slice(-4);
  const swingResult = detectDivergenceFromSwings("Bullish", swingLows);
  return swingResult.type === "Bullish" ? swingResult : detectRecentWindowDivergence("Bullish", points, swingLows);
}

export function detectBearishDivergence(points: IndicatorPoint[]): DivergenceResult {
  const swingHighs = withRecentHighCandidate(points, detectSwingHighs(points)).slice(-4);
  const swingResult = detectDivergenceFromSwings("Bearish", swingHighs);
  return swingResult.type === "Bearish" ? swingResult : detectRecentWindowDivergence("Bearish", points, swingHighs);
}

function withRecentLowCandidate(points: IndicatorPoint[], swings: SwingPoint[]): SwingPoint[] {
  const candidate = points
    .slice(-5)
    .map((point, offset) => ({ point, index: points.length - 5 + offset }))
    .filter(({ point }) => point.rsi !== null)
    .sort((a, b) => a.point.low - b.point.low)[0];

  if (!candidate || swings.some((swing) => swing.index === candidate.index)) {
    return swings;
  }

  return [
    ...swings,
    {
      index: candidate.index,
      price: candidate.point.low,
      rsi: candidate.point.rsi!,
      time: candidate.point.time
    }
  ].sort((a, b) => a.index - b.index);
}

function withRecentHighCandidate(points: IndicatorPoint[], swings: SwingPoint[]): SwingPoint[] {
  const candidate = points
    .slice(-5)
    .map((point, offset) => ({ point, index: points.length - 5 + offset }))
    .filter(({ point }) => point.rsi !== null)
    .sort((a, b) => b.point.high - a.point.high)[0];

  if (!candidate || swings.some((swing) => swing.index === candidate.index)) {
    return swings;
  }

  return [
    ...swings,
    {
      index: candidate.index,
      price: candidate.point.high,
      rsi: candidate.point.rsi!,
      time: candidate.point.time
    }
  ].sort((a, b) => a.index - b.index);
}

function detectDivergenceFromSwings(type: Exclude<DivergenceType, "None">, swings: SwingPoint[]): DivergenceResult {
  if (swings.length < 2) {
    return {
      type: "None",
      strength: 0,
      swingCount: swings.length,
      points: swings
    };
  }

  let bestStrength = 0;
  let bestPoints: SwingPoint[] = [];

  for (let index = 1; index < swings.length; index += 1) {
    const previous = swings[index - 1];
    const current = swings[index];
    const priceMove = ((current.price - previous.price) / previous.price) * 100;
    const rsiMove = current.rsi - previous.rsi;

    const isBullish = type === "Bullish" && priceMove < -0.1 && rsiMove > 0.5;
    const isBearish = type === "Bearish" && priceMove > 0.1 && rsiMove < -0.5;

    if (!isBullish && !isBearish) {
      continue;
    }

    const strength = Math.min(100, Math.round(Math.abs(priceMove) * 12 + Math.abs(rsiMove) * 3));

    if (strength > bestStrength) {
      bestStrength = strength;
      bestPoints = [previous, current];
    }
  }

  return {
    type: bestStrength > 0 ? type : "None",
    strength: bestStrength,
    swingCount: swings.length,
    points: bestStrength > 0 ? bestPoints : swings
  };
}

function detectRecentWindowDivergence(
  type: Exclude<DivergenceType, "None">,
  points: IndicatorPoint[],
  existingSwings: SwingPoint[]
): DivergenceResult {
  const validPoints = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.rsi !== null);

  if (validPoints.length < 24) {
    return {
      type: "None",
      strength: 0,
      swingCount: existingSwings.length,
      points: existingSwings
    };
  }

  const recentWindow = validPoints.slice(-10);
  const priorWindow = validPoints.slice(-34, -10);
  const prior = type === "Bullish" ? lowestPoint(priorWindow) : highestPoint(priorWindow);
  const recent = type === "Bullish" ? lowestPoint(recentWindow) : highestPoint(recentWindow);

  if (!prior || !recent) {
    return {
      type: "None",
      strength: 0,
      swingCount: existingSwings.length,
      points: existingSwings
    };
  }

  const priceMove = ((recent.price - prior.price) / prior.price) * 100;
  const rsiMove = recent.rsi - prior.rsi;
  const isBullish = type === "Bullish" && priceMove < -0.1 && rsiMove > 1.5;
  const isBearish = type === "Bearish" && priceMove > 0.1 && rsiMove < -1.5;

  if (!isBullish && !isBearish) {
    return {
      type: "None",
      strength: 0,
      swingCount: existingSwings.length,
      points: existingSwings
    };
  }

  return {
    type,
    strength: Math.min(100, Math.round(Math.abs(priceMove) * 10 + Math.abs(rsiMove) * 2.5)),
    swingCount: Math.max(existingSwings.length, 2),
    points: [prior, recent]
  };
}

function lowestPoint(points: Array<{ point: IndicatorPoint; index: number }>): SwingPoint | null {
  const result = points.reduce<Array<{ point: IndicatorPoint; index: number }>[number] | null>(
    (lowest, candidate) => (!lowest || candidate.point.low < lowest.point.low ? candidate : lowest),
    null
  );

  return result && result.point.rsi !== null
    ? {
        index: result.index,
        price: result.point.low,
        rsi: result.point.rsi,
        time: result.point.time
      }
    : null;
}

function highestPoint(points: Array<{ point: IndicatorPoint; index: number }>): SwingPoint | null {
  const result = points.reduce<Array<{ point: IndicatorPoint; index: number }>[number] | null>(
    (highest, candidate) => (!highest || candidate.point.high > highest.point.high ? candidate : highest),
    null
  );

  return result && result.point.rsi !== null
    ? {
        index: result.index,
        price: result.point.high,
        rsi: result.point.rsi,
        time: result.point.time
      }
    : null;
}
