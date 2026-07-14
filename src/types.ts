export type SignalSide = "bullish" | "bearish" | "neutral";

export type SignalState = "watch" | "confirmed" | "invalidated" | "none";

export type SignalType =
  | "Bounce Watch"
  | "Bounce Confirmed"
  | "Pullback Watch"
  | "Pullback Confirmed"
  | "Invalidated"
  | "No Alert";

export type BollingerStatus =
  | "Lower Band Break"
  | "Lower Band Touch"
  | "Upper Band Touch"
  | "Upper Band Break"
  | "Inside Bands";

export type DivergenceType = "Bullish" | "Bearish" | "None";

export type VwapStatus =
  | "Above VWAP"
  | "Below VWAP"
  | "Reclaimed VWAP"
  | "Rejected VWAP";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "1d";

export type ProviderId = "mock" | "alpaca-delayed-sip" | "yahoo-public";

export interface ScanCoverage {
  requestedSymbols: number;
  priceEligibleSymbols: number;
  completedSymbols: number;
  unavailableSymbols: string[];
  latestCandleAt: string | null;
  metadataStatus: "simulated" | "reference" | "partial-live" | "live";
}

export interface FeedStatus {
  providerId: ProviderId;
  providerLabel: string;
  mode: "mock" | "api";
  freshness: string;
  configured: boolean;
  message: string;
  sourceUrl?: string;
  coverage: ScanCoverage;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerMeta {
  symbol: string;
  companyName: string;
  sector: string;
  marketCap: number;
  avgVolume: number;
  spreadBps: number;
  floatShares: number;
  earningsInDays: number | null;
}

export interface IndicatorPoint extends Candle {
  sma: number | null;
  upperBand: number | null;
  lowerBand: number | null;
  bandWidth: number | null;
  rsi: number | null;
  vwap: number | null;
  atr: number | null;
  relativeVolume: number | null;
}

export interface SwingPoint {
  index: number;
  price: number;
  rsi: number;
  time: string;
}

export interface DivergenceResult {
  type: DivergenceType;
  strength: number;
  swingCount: number;
  points: SwingPoint[];
}

export interface ScoreBreakdown {
  bollinger: number;
  rsi: number;
  divergence: number;
  volume: number;
  vwap: number;
  volatility: number;
  marketContext: number;
}

export interface AlertEvent {
  time: string;
  label: string;
  severity: "info" | "watch" | "confirm" | "warning";
}

export interface RiskZones {
  invalidation: number;
  firstTarget: number;
  secondTarget: number;
  atr: number;
  riskReward: number;
}

export interface Opportunity {
  rank: number;
  symbol: string;
  companyName: string;
  sector: string;
  currentPrice: number;
  signalType: SignalType;
  side: SignalSide;
  state: SignalState;
  score: number;
  alertLevel: "Very High Interest" | "High Interest" | "Watch Closely" | "Early Watch" | "No Alert";
  rsi: number | null;
  bollingerStatus: BollingerStatus;
  divergence: DivergenceResult;
  relativeVolume: number | null;
  vwapStatus: VwapStatus;
  spreadBps: number;
  liquidityWarning: string | null;
  lastUpdated: string;
  timeframe: Timeframe;
  explanation: string;
  timeline: AlertEvent[];
  scoreBreakdown: ScoreBreakdown;
  chartData: IndicatorPoint[];
  risk: RiskZones;
  warnings: string[];
  meta: TickerMeta;
}

export interface MarketContext {
  symbol: string;
  trend: "Supportive" | "Mixed" | "Contradicting";
  changePercent: number;
  rsi: number;
  note: string;
}

export interface MarketSnapshot {
  timestamp: string;
  opportunities: Opportunity[];
  context: MarketContext[];
  feedStatus: FeedStatus;
}

export interface ScannerFilters {
  minScore: number;
  side: "all" | "bullish" | "bearish";
  minRelativeVolume: number;
  minAverageVolume: number;
  priceMin: number;
  priceMax: number;
  excludeEarningsDays: number;
  hideLiquidityWarnings: boolean;
  timeframe: Timeframe;
}

export interface MarketScanRequest {
  timeframe: Timeframe;
  symbols: string[];
  priceMin: number;
  priceMax: number;
}
