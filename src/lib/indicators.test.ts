import { describe, expect, it } from "vitest";
import { calculateRSI, detectBearishDivergence, detectBullishDivergence } from "./indicators";
import type { IndicatorPoint } from "../types";

describe("indicator calculations", () => {
  it("calculates RSI values after the configured period", () => {
    const values = [44, 44.2, 44.1, 44.6, 44.9, 45.1, 44.8, 45.2, 45.4, 45.7, 46, 45.8, 46.2, 46.5, 46.1];
    const rsi = calculateRSI(values, 13);

    expect(rsi[12]).toBeNull();
    expect(rsi[13]).toBeGreaterThan(50);
    expect(rsi[14]).toBeGreaterThan(40);
  });

  it("detects bullish divergence when price makes a lower low and RSI makes a higher low", () => {
    const points = buildPoints({
      lows: [10, 9.7, 9.4, 9.1, 8.8, 8.4, 8.0, 8.3, 8.6, 8.9, 9.0, 8.7, 8.4, 8.0, 7.7, 8.1, 8.5, 8.9, 9.1],
      highs: [10.4, 10.1, 9.8, 9.5, 9.2, 8.8, 8.4, 8.7, 9.0, 9.3, 9.4, 9.1, 8.8, 8.4, 8.1, 8.5, 8.9, 9.3, 9.5],
      rsi: [45, 40, 36, 32, 29, 24, 20, 24, 28, 32, 35, 33, 31, 29, 30, 36, 43, 49, 55]
    });
    const result = detectBullishDivergence(points);

    expect(result.type).toBe("Bullish");
  });

  it("detects bearish divergence when price makes a higher high and RSI makes a lower high", () => {
    const points = buildPoints({
      lows: [9.6, 9.9, 10.2, 10.5, 10.8, 11.2, 11.6, 11.3, 11.0, 10.7, 10.6, 10.9, 11.2, 11.6, 12.0, 11.7, 11.3, 10.9, 10.6],
      highs: [10.0, 10.3, 10.7, 11.1, 11.5, 11.9, 12.2, 11.8, 11.4, 11.0, 10.9, 11.3, 11.7, 12.1, 12.6, 12.2, 11.8, 11.3, 10.9],
      rsi: [55, 60, 65, 70, 75, 79, 82, 76, 69, 63, 61, 65, 69, 72, 70, 64, 57, 51, 46]
    });
    const result = detectBearishDivergence(points);

    expect(result.type).toBe("Bearish");
  });
});

function buildPoints(input: { lows: number[]; highs: number[]; rsi: number[] }): IndicatorPoint[] {
  return input.lows.map((low, index) => ({
    time: `10:${String(index).padStart(2, "0")}`,
    open: (input.highs[index] + low) / 2,
    high: input.highs[index],
    low,
    close: (input.highs[index] + low) / 2,
    volume: 100000 + index * 1000
  ,
    sma: null,
    upperBand: null,
    lowerBand: null,
    bandWidth: null,
    rsi: input.rsi[index],
    vwap: null,
    atr: null,
    relativeVolume: null
  }));
}
