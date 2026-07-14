import { describe, expect, it } from "vitest";
import { normalizeSymbols, WATCHLIST_LIMIT } from "./watchlist";

describe("normalizeSymbols", () => {
  it("normalizes, de-duplicates, and rejects malformed symbols", () => {
    expect(normalizeSymbols("achr, JOBY ACHR;bad-symbol 1234 BRK.B")).toEqual(["ACHR", "JOBY", "BRK.B"]);
  });

  it("caps a watchlist at the supported scan limit", () => {
    const symbols = Array.from(
      { length: WATCHLIST_LIMIT + 5 },
      (_, index) => `A${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`
    );
    expect(normalizeSymbols(symbols)).toHaveLength(WATCHLIST_LIMIT);
  });
});
