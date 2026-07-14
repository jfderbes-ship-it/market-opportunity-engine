const storageKey = "market-opportunity-engine.personal-watchlist.v1";

export const TRIAL_SWING_WATCHLIST = [
  "AAL", "ACB", "ACHR", "AFRM", "AMPX", "ASTS", "BBAI", "BITF", "BKSY", "BLDE",
  "CCL", "CHPT", "CIFR", "CLSK", "CLOV", "CRSP", "DNA", "EVGO", "F", "FUBO",
  "GPRO", "GRAB", "HIMS", "HOOD", "IONQ", "JOBY", "LCID", "LUMN", "LUNR", "MARA",
  "NCLH", "NIO", "OPEN", "PLUG", "QBTS", "QS", "RGTI", "RIOT", "RKLB", "RUN",
  "SIRI", "SNAP", "SOFI", "TMC", "UPST", "VALE", "WBD", "WOLF", "WULF", "XPEV"
] as const;

export const WATCHLIST_LIMIT = 50;

export function normalizeSymbols(value: string | string[]): string[] {
  const rawSymbols = Array.isArray(value) ? value : value.split(/[\s,;]+/);
  const unique = new Set<string>();

  for (const rawSymbol of rawSymbols) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (/^[A-Z][A-Z.]{0,9}$/.test(symbol)) {
      unique.add(symbol);
    }
  }

  return [...unique].slice(0, WATCHLIST_LIMIT);
}

export function loadPersonalWatchlist(): string[] {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === null) {
    return [...TRIAL_SWING_WATCHLIST];
  }

  try {
    return normalizeSymbols(JSON.parse(stored));
  } catch {
    return [...TRIAL_SWING_WATCHLIST];
  }
}

export function savePersonalWatchlist(symbols: string[]): void {
  window.localStorage.setItem(storageKey, JSON.stringify(normalizeSymbols(symbols)));
}
